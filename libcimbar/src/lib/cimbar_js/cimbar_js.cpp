/* This code is subject to the terms of the Mozilla Public License, v.2.0. http://mozilla.org/MPL/2.0/. */
#include "cimbar_js.h"

#include "cimb_translator/Config.h"
#include "encoder/SimpleEncoder.h"
#include "gui/window_glfw.h"
#include "util/byte_istream.h"

#include "cimb_translator/Config.h"
#include "compression/zstd_decompressor.h"
#include "encoder/Decoder.h"
#include "encoder/Encoder.h"
#include "extractor/Extractor.h"
#include "extractor/SimpleCameraCalibration.h"
#include "extractor/Undistort.h"
#include "fountain/FountainInit.h"
#include "fountain/fountain_decoder_sink.h"
#include "serialize/str.h"

#include <cstdio>
#include <functional>
#include <iostream>
#include <string>
#include <vector>
#include <glob.h>
#include <numeric>

using std::string;
using std::vector;

namespace
{
	std::shared_ptr<cimbar::window_glfw> _window;
	std::shared_ptr<fountain_encoder_stream> _fes;
	std::optional<cv::Mat> _next;

	int _frameCount = 0;
	uint8_t _encodeId = 109;

	// settings
	unsigned _ecc = cimbar::Config::ecc_bytes();
	unsigned _colorBits = cimbar::Config::color_bits();
	int _compressionLevel = cimbar::Config::compression_level();
	bool _legacyMode = false;

	fountain_decoder_sink<std::ofstream> *sink1 = nullptr;
	fountain_decoder_sink<cimbar::zstd_decompressor<std::ofstream>> *sink2 = nullptr;
	fountain_decoder_sink<cimbar::zstd_decompressor<std::ofstream>> *common_sink = nullptr;

	bool multiple = true;
}

template <typename FilenameIterable>
int decode(const FilenameIterable &infiles, const std::function<int(cv::UMat, unsigned, bool, int)> &decodefun, bool no_deskew, bool undistort, unsigned color_mode, int preprocess, int color_correct)
{
	int err = 0;
	for (const string &inf : infiles)
	{
		printf("decode inf: %s\n", inf.c_str());
		if (inf.empty())
			return -1; // continue;
		bool shouldPreprocess = (preprocess == 1);

		cv::UMat img = cv::imread(inf).getUMat(cv::ACCESS_RW);
		cv::cvtColor(img, img, cv::COLOR_BGR2RGB);

		if (!no_deskew)
		{
			// attempt undistort. It's currently a low-effort attempt to *reduce* distortion, not eliminate it.
			// we rely on the decoder to power through minor distortion
			if (undistort)
			{
				Undistort<SimpleCameraCalibration> und;
				if (!und.undistort(img, img))
					err |= 1;
			}

			Extractor ext;
			int res = ext.extract(img, img);
			if (!res)
			{
				err |= 2;
				return err;
			}
			else if (preprocess != 0 and res == Extractor::NEEDS_SHARPEN)
				shouldPreprocess = true;
		}

		int bytes = decodefun(img, color_mode, shouldPreprocess, color_correct);
		if (!bytes)
			err |= 4;
	}
	return err;
}

int decodeImage(uint8_t *imageData, int width, int height,const std::function<int(cv::UMat, unsigned, bool, int)> &decodefun, bool no_deskew, bool undistort, unsigned color_mode, int preprocess, int color_correct){
	cv::Mat mat(height, width, CV_8UC4, imageData);
	cv::UMat img;
	mat.copyTo(img);
	cv::cvtColor(img, img, cv::COLOR_BGR2RGB);

	bool shouldPreprocess = (preprocess == 1);
	int err = 0;

	if (!no_deskew)
	{
		// attempt undistort. It's currently a low-effort attempt to *reduce* distortion, not eliminate it.
		// we rely on the decoder to power through minor distortion
		if (undistort)
		{
			Undistort<SimpleCameraCalibration> und;
			if (!und.undistort(img, img))
				err |= 1;
		}

		Extractor ext;
		int res = ext.extract(img, img);
		if (!res)
		{
			err |= 2;
			return err;
		}
		else if (preprocess != 0 and res == Extractor::NEEDS_SHARPEN)
			shouldPreprocess = true;
	}

	int bytes = decodefun(img, color_mode, shouldPreprocess, color_correct);
	if (!bytes)
		err |= 4;
	return err;
}

// see also "decodefun" for non-fountain decodes, defined as a lambda inline below.
// this one needs its own function since it's a template (:
template <typename SINK>
std::function<int(cv::UMat, unsigned, bool, int)> fountain_decode_fun(SINK &sink, Decoder &d, bool multiple)
{
	return [&sink, &d, multiple](cv::UMat m, unsigned cm, bool pre, int cc)
	{
		return d.decode_fountain(m, sink, cm, pre, cc, multiple);
	};
}

extern "C"
{

	int initialize_GL(int width, int height)
	{
		if (_window)
			return 1;

		// must be divisible by 4???
		if (width % 4 != 0)
			width += (4 - width % 4);
		if (height % 4 != 0)
			height += (4 - height % 4);
		std::cerr << "initializing " << width << " by " << height << " window";

		_window = std::make_shared<cimbar::window_glfw>(width, height, "Cimbar Encoder");
		if (!_window or !_window->is_good())
			return 0;

		return 1;
	}

	// render() and next_frame() could be put in the same function,
	// but it seems cleaner to split them.
	// in any case, we're concerned with frame pacing (some encodes take longer than others)
	int render()
	{
		if (!_window or !_fes or _window->should_close())
			return -1;

		if (_next)
		{
			_window->show(*_next, 0);
			_window->shake();
			return 1;
		}
		return 0;
	}

	int next_frame()
	{
		if (!_window or !_fes)
			return 0;

		// we generate 5x the amount of required symbol blocks -- unless everything fits in a single frame.
		// color blocks will contribute to this total, but only symbols are used for the initial calculation.
		// ... this way, if the color decode is failing, it won't get "stuck" failing to read a single frame.
		unsigned required = _fes->blocks_required();
		if (required > cimbar::Config::fountain_chunks_per_frame(cimbar::Config::symbol_bits(), _legacyMode))
			required = required * 5;
		if (_fes->block_count() > required)
		{
			_fes->restart();
			_window->shake(0);
			_frameCount = 0;
		}

		SimpleEncoder enc(_ecc, cimbar::Config::symbol_bits(), _colorBits);
		if (_legacyMode)
			enc.set_legacy_mode();

		enc.set_encode_id(_encodeId);
		_next = enc.encode_next(*_fes, _window->width());
		return ++_frameCount;
	}

	int encode(unsigned char *buffer, unsigned size, int encode_id)
	{
		_frameCount = 0;
		if (!FountainInit::init())
			std::cerr << "failed FountainInit :(" << std::endl;

		SimpleEncoder enc(_ecc, cimbar::Config::symbol_bits(), _colorBits);
		if (_legacyMode)
			enc.set_legacy_mode();

		if (encode_id < 0)
			enc.set_encode_id(++_encodeId); // increment _encodeId every time we change files
		else
			enc.set_encode_id(static_cast<uint8_t>(encode_id));

		cimbar::byte_istream bis(reinterpret_cast<char *>(buffer), size);
		_fes = enc.create_fountain_encoder(bis, _compressionLevel);

		if (!_fes)
			return 0;

		_next.reset();
		return 1;
	}


	int decodeImage(uint8_t *imageData, int width, int height,char *out_buf, unsigned out_size){
		unsigned colorBits = _colorBits;
		unsigned compressionLevel = _compressionLevel;
		unsigned ecc = _ecc;
		bool legacy_mode = _legacyMode;
		bool no_deskew = false;
		bool undistort = false;
		int preprocess = -1;
		int color_correct = 2;
		unsigned color_mode = legacy_mode ? 0 : 1;
		unsigned chunkSize = cimbar::Config::fountain_chunk_size(ecc, colorBits + cimbar::Config::symbol_bits(), legacy_mode);
		string outpath(out_buf);
		Decoder d(ecc, colorBits);
		int res = -200;

		if (compressionLevel <= 0)
		{
			// fountain_decoder_sink<std::ofstream> sink(outpath, chunkSize, true);
			if (!sink1)
			{
				sink1 = new fountain_decoder_sink<std::ofstream>(outpath, chunkSize, true);
			}
			else
			{
				std::cout << "Reusing existing sink from namespace." << std::endl;
			}
			res = decodeImage(imageData,width,height, fountain_decode_fun(*sink1, d, multiple), no_deskew, undistort, color_mode, preprocess, color_correct);
		}
		else // default case, all bells and whistles
		{
			if (!sink2)
			{
				sink2 = new fountain_decoder_sink<cimbar::zstd_decompressor<std::ofstream>>(outpath, chunkSize, true);
			}
			else
			{
				std::cout << "Reusing existing sink from namespace." << std::endl;
			}
			printf("decode - fountain no_deskew: %d, undistort: %d, color_mode: %d, preprocess: %d, color_correct: %d\n", no_deskew, undistort, color_mode, preprocess, color_correct);
			res = decodeImage(imageData,width,height, fountain_decode_fun(*sink2, d, multiple), no_deskew, undistort, color_mode, preprocess, color_correct);
		}

		return res;
	}

	/**
	 * Decode input files.
	 *
	 * @param[in] in_buf Input file path buffer to decode
	 * @param[in] in_size Input file path buffer length
	 * @param[out] out_buf Output file path buffer
	 * @param[out] out_size Output file path buffer length
	 *
	 * @return Status code. 0 - success
	 */
	int decode(const char *in_buf, unsigned in_size, char *out_buf, unsigned out_size)
	{
		unsigned colorBits = _colorBits;
		unsigned compressionLevel = _compressionLevel;
		unsigned ecc = _ecc;
		bool legacy_mode = _legacyMode;
		bool no_fountain = false;
		bool no_deskew = false;
		bool undistort = false;
		bool useStdin = false;
		int preprocess = -1;
		int color_correct = 2;

		printf("decode - in_buf: %p, in_size: %d, out_buf: %p, out_size: %d\n", in_buf, in_size, out_buf, out_size);
		if (in_buf == nullptr || out_buf == nullptr)
		{
			printf("decode - invalid parameter, return -1\n");
			return -1;
		}

		string input_file(in_buf);
		std::cout << "decode - in_buf: " << input_file << std::endl;
		vector<string> infiles;
		glob_t glob_result;
		memset(&glob_result, 0, sizeof(glob_result));
		int ret = glob(input_file.c_str(), GLOB_MARK, NULL, &glob_result);
		if (ret == 0)
		{
			for (size_t i = 0; i < glob_result.gl_pathc; ++i)
			{
				infiles.push_back(glob_result.gl_pathv[i]);
			}
			globfree(&glob_result);
		}
		std::cout << "infiles.size(): " << infiles.size() << ", infiles[0]: " << infiles[0] << std::endl;

		string outpath(out_buf);
		std::cout << "decode - out_dir: " << outpath << std::endl;

		unsigned color_mode = legacy_mode ? 0 : 1;
		Decoder d(ecc, colorBits);

		printf("decode - colorBits: %d, ecc: %d, compressionLevel: %d, legacy_mode: %d\n", colorBits, ecc, compressionLevel, legacy_mode);
		if (no_fountain)
		{
			// if (not color_correction_file.empty())
			// 	d.load_ccm(color_correction_file);

			// simpler encoding, just the basics + ECC. No compression, fountain codes, etc.
			std::ofstream f(outpath);
			std::function<int(cv::UMat, unsigned, bool, int)> decodefun = [&f, &d](cv::UMat m, unsigned cm, bool pre, int cc)
			{
				return d.decode(m, f, cm, pre, cc);
			};
			printf("no_fountain no_deskew: %d, undistort: %d, color_mode: %d, preprocess: %d, color_correct: %d\n", no_deskew, undistort, color_mode, preprocess, color_correct);
			return decode(infiles, decodefun, no_deskew, undistort, color_mode, preprocess, color_correct);
		}

		// else, the good stuff
		int res = -200;

		unsigned chunkSize = cimbar::Config::fountain_chunk_size(ecc, colorBits + cimbar::Config::symbol_bits(), legacy_mode);
		printf("chunkSize: %u\n", chunkSize);
		if (compressionLevel <= 0)
		{
			// fountain_decoder_sink<std::ofstream> sink(outpath, chunkSize, true);
			if (!sink1)
			{
				sink1 = new fountain_decoder_sink<std::ofstream>(outpath, chunkSize, true);
			}
			else
			{
				std::cout << "Reusing existing sink from namespace." << std::endl;
			}
			res = decode(infiles, fountain_decode_fun(*sink1, d, multiple), no_deskew, undistort, color_mode, preprocess, color_correct);
		}
		else // default case, all bells and whistles
		{
			if (!sink2)
			{
				sink2 = new fountain_decoder_sink<cimbar::zstd_decompressor<std::ofstream>>(outpath, chunkSize, true);
			}
			else
			{
				std::cout << "Reusing existing sink from namespace." << std::endl;
			}
			printf("decode - fountain no_deskew: %d, undistort: %d, color_mode: %d, preprocess: %d, color_correct: %d\n", no_deskew, undistort, color_mode, preprocess, color_correct);
			res = decode(infiles, fountain_decode_fun(*sink2, d, multiple), no_deskew, undistort, color_mode, preprocess, color_correct);
		}
		// if (not color_correction_file.empty())
		// 	d.save_ccm(color_correction_file);

		return res;
	}

	int configure(unsigned color_bits, unsigned ecc, int compression, bool legacy_mode)
	{
		// defaults
		if (color_bits > 3)
			color_bits = cimbar::Config::color_bits();
		if (ecc >= 150)
			ecc = cimbar::Config::ecc_bytes();
		if (compression < 0 or compression > 22)
			compression = cimbar::Config::compression_level();

		// check if we need to refresh the stream
		bool refresh = (color_bits != _colorBits or ecc != _ecc or compression != _compressionLevel or legacy_mode != _legacyMode);
		if (refresh)
		{
			// update config
			_colorBits = color_bits;
			_ecc = ecc;
			_compressionLevel = compression;
			_legacyMode = legacy_mode;

			// try to refresh the stream
			if (_window and _fes)
			{
				unsigned buff_size_new = cimbar::Config::fountain_chunk_size(_ecc, cimbar::Config::symbol_bits() + _colorBits, _legacyMode);
				if (!_fes->restart_and_resize_buffer(buff_size_new))
				{
					// if the data is too small, we should throw out _fes -- and clear the canvas.
					_fes = nullptr;
					_window->clear();
					_next.reset();
				}
				_frameCount = 0;
				_window->shake(0);
			}
		}
		return 0;
	}

	double get_progress()
	{
		std::vector<double> vec = {0};
		if (sink1)
		{
			vec = sink1->get_progress();
		}
		if (sink2)
		{
			vec = sink2->get_progress();
		}
		double progress = std::accumulate(vec.begin(), vec.end(), 0.0);
		return progress;
	}

	int init_sink(char *out_buf, unsigned out_size)
	{
		unsigned colorBits = _colorBits;
		unsigned ecc = _ecc;
		bool legacy_mode = _legacyMode;

		if (out_buf == nullptr)
		{
			printf("decode - invalid parameter, return -1\n");
			return -1;
		}

		string outpath(out_buf);
		unsigned chunkSize = cimbar::Config::fountain_chunk_size(ecc, colorBits + cimbar::Config::symbol_bits(), legacy_mode);

		if (!common_sink)
		{
			common_sink = new fountain_decoder_sink<cimbar::zstd_decompressor<std::ofstream>>(outpath, chunkSize, true);
		}
		else
		{
			std::cout << "Reusing existing sink from namespace." << std::endl;
		}

		return 1;
	}

	// bool write_frame_data(const char *in_buf, unsigned size)
	bool write_frame_data(const char *in_buf)
	{
		string input_file(in_buf);
		printf("decode inf: %s\n", input_file.c_str());

		std::ifstream file(input_file, std::ios::binary);
		if (!file)
		{
			return false;
		}

		std::vector<char> _buffer;

		// 获取文件大小
		file.seekg(0, std::ios::end);
		size_t file_size = file.tellg();
		file.seekg(0, std::ios::beg);

		// 调整缓冲区大小以适应文件内容
		_buffer.resize(file_size);

		// 读取文件内容到缓冲区
		file.read(_buffer.data(), file_size);
		return common_sink->write(_buffer.data(), 625);
	}

	double get_common_progress()
	{
		std::vector<double> vec = common_sink->get_progress();
		double progress = std::accumulate(vec.begin(), vec.end(), 0.0);
		return progress;
	}

	bool degrade()
	{
		multiple = false;
		return multiple;
	}
}
