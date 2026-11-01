# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# Models for a bring-your-own resource (service.json `models`, Compose models served by Docker Model Runner).
# A Compose stack such as nosia declares `models: {llm: {model: ai/smollm2}}` at the top and lists `models: [llm]` on the service
# that uses it. Each service carries a marker line ("# flisk-byo-model: llm ai/smollm2") that generate_app_compose_from_entries
# turns into the top-level `models:` block, so two services naming the same model share one declaration.
# `model` is a model reference (ai/smollm2, ai/qwen3:8B-Q4_K_M, hf.co/org/name) or a Compose variable (${LLM_MODEL},
# ${LLM_MODEL:-ai/smollm2}) and is written quoted. Each value is checked character by character, because it is written into the
# generated Compose YAML. Keep in step with modelsErrors in cli/src/utils/service-manifest.ts. This file has no load() on purpose.
# =============================================================================

MODEL_MARKER = "# flisk-byo-model: "

_ALNUM = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
_NAME_CHARS = _ALNUM + "_.-"
_REFERENCE_CHARS = _ALNUM + "._/:@-"
_VARIABLE_CHARS = _ALNUM + "_"


def _only(value, chars):
    for c in value.elems():
        if c not in chars:
            return False
    return True


def _is_reference(value):
    return bool(value) and value[0] in _ALNUM and _only(value, _REFERENCE_CHARS)


def model_value_ok(value):
    """A model reference such as ai/smollm2, or ${NAME} / ${NAME:-<model reference>}."""
    if type(value) != "string" or not value:
        return False
    if not value.startswith("${"):
        return _is_reference(value)
    if not value.endswith("}"):
        return False
    variable, sep, default = value[2:-1].partition(":-")
    if not variable or variable[0] in "0123456789" or not _only(variable, _VARIABLE_CHARS):
        return False
    return not sep or _is_reference(default)


def byo_models(manifest):
    """Compose `models:` lines for service.json `models` on a bring-your-own resource.

    Args:
        manifest: the service.json

    Returns:
        The YAML for the service (one marker line per model, then the `models:` list), or "" when there are none.
    """
    models = manifest.get('models') if manifest else None
    if models == None or manifest.get('appType') != 'bring-your-own':
        return ""
    if type(models) != "list":
        fail("MANIFEST ERROR: 'models' must be a list such as [{\"name\": \"llm\", \"model\": \"ai/smollm2\"}]")

    names = []
    markers = []
    for i, entry in enumerate(models):
        field = "models[{}]".format(i)
        if type(entry) != "dict":
            fail("MANIFEST ERROR: '{}' must be an object such as {{\"name\": \"llm\", \"model\": \"ai/smollm2\"}}".format(field))
        for key in entry.keys():
            if key not in ["name", "model"]:
                fail("MANIFEST ERROR: '{}.{}' is not a model option (use name, model)".format(field, key))
        name = entry.get('name')
        model = entry.get('model')
        if type(name) != "string" or not name or name[0] not in _ALNUM or not _only(name, _NAME_CHARS):
            fail("MANIFEST ERROR: '{}.name' must be a model name such as llm (letters, digits, '-', '_' and '.')".format(field))
        if name in names:
            fail("MANIFEST ERROR: '{}.name' {} is listed twice".format(field, name))
        if not model_value_ok(model):
            fail("MANIFEST ERROR: '{}.model' must be a model such as ai/smollm2, or a variable such as ${{LLM_MODEL:-ai/smollm2}}".format(field))
        names.append(name)
        markers.append("    {}{} {}".format(MODEL_MARKER, name, model))

    if not names:
        return ""
    return "\n".join(markers + ["    models:"] + ["      - {}".format(name) for name in names]) + "\n"
