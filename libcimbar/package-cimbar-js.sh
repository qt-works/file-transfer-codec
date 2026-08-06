#!/bin/bash
#docker run --mount type=bind,source="$(pwd)",target="/usr/src/app" -it emscripten/emsdk:3.1.39

cd /usr/src/app/opencv4/
mkdir opencv-build-wasm
cd opencv-build-wasm
python3 ../platforms/js/build_js.py build_wasm --build_wasm --emscripten_dir=/emsdk/upstream/emscripten

cd /usr/src/app
mkdir build-wasm
cd build-wasm
emcmake cmake .. -DUSE_WASM=1 -DOPENCV_DIR=/usr/src/app/opencv4
make -j8 install
