#!/bin/bash

docker run --rm --mount type=bind,source="$(pwd)",target="/usr/src/app" emscripten/emsdk:3.1.39 bash /usr/src/app/package-cimbar-js.sh
