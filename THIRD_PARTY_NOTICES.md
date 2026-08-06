# Third-Party Notices

This project distributes source code and generated WebAssembly that include third-party components. Each third-party component remains under its own license.

## Components

| Component | Location | License |
| --- | --- | --- |
| libcimbar | `libcimbar` | MPL-2.0; upstream: <https://github.com/sz3/libcimbar> |
| OpenCV 4.10.0-dev source snapshot | `libcimbar/opencv4` | Apache-2.0; upstream: <https://github.com/opencv/opencv> |
| base91 | `libcimbar/src/third_party_lib/base91` | zlib-like permissive license |
| concurrentqueue | `libcimbar/src/third_party_lib/concurrentqueue` | BSD-style / Boost Software License notices |
| cxxopts | `libcimbar/src/third_party_lib/cxxopts` | MIT |
| fmt | `libcimbar/src/third_party_lib/fmt` | MIT |
| intx | `libcimbar/src/third_party_lib/intx` | Apache-2.0 |
| libcorrect | `libcimbar/src/third_party_lib/libcorrect` | BSD-3-Clause |
| libpopcnt | `libcimbar/src/third_party_lib/libpopcnt` | BSD-2-Clause |
| PicoSHA2 | `libcimbar/src/third_party_lib/PicoSHA2` | MIT |
| stb | `libcimbar/src/third_party_lib/stb` | MIT or public domain |
| wirehair | `libcimbar/src/third_party_lib/wirehair` | BSD-3-Clause |
| zstd | `libcimbar/src/third_party_lib/zstd` | BSD license, with upstream GPLv2 alternative text included |

## OpenCV Third-Party Tree

The vendored OpenCV snapshot contains the following top-level integration or third-party source directories under `libcimbar/opencv4/3rdparty`:

`carotene`, `cpufeatures`, `ffmpeg`, `flatbuffers`, `hal_rvv`, `include` (OpenCL and Vulkan headers), `ippicv`, `ittnotify`, `kleidicv`, `libjasper`, `libjpeg`, `libjpeg-turbo`, `libpng`, `libspng`, `libtiff`, `libtim-vx`, `libwebp`, `ndsrvp`, `openexr`, `openjpeg`, `openvx`, `orbbecsdk`, `protobuf`, `quirc`, `tbb`, `zlib`, and `zlib-ng`.

OpenCV also carries component-specific third-party material inside some module directories. Original license and copyright files are preserved alongside that material, including under `modules/core/3rdparty`, `modules/dnn/src`, `modules/gapi/src`, and `modules/highgui/src`.

The presence of a directory in the OpenCV source snapshot does not mean that component is linked into this project's WebAssembly binary. The effective binary contents are determined by the OpenCV and libcimbar build configuration. Redistributors must comply with the licenses of the components they actually build or distribute.

## Source Availability

The WebAssembly files in the npm package are generated from `libcimbar` and the required third-party source. The corresponding source code is available in this repository at <https://github.com/qt-works/log-extraction>. Use the Git tag matching the npm package version when one is available.

The npm package includes the project notices, the MPL-2.0 text from `libcimbar/LICENSE`, and preserved license/copyright files from the vendored libcimbar and OpenCV trees. The repository remains the source distribution; the native source tree itself is intentionally not copied into the npm package.

## Required Notices

Do not remove copyright notices, license headers, `LICENSE`, `COPYING`, `COPYRIGHT`, or notice files from vendored third-party source directories when redistributing source or generated binaries.
