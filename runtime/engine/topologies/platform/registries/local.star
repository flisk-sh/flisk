# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
load("../../tilt/resources/infra-loader.star", _Infra = "Infra")

def load(should_enable):
    return _Infra.load_verdaccio(should_enable)
