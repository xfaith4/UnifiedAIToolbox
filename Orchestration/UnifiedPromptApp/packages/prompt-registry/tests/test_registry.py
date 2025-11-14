from prompt_registry import find_prompt_by_id, list_prompts


def test_registry_lists_prompts():
    prompts = list_prompts()
    assert prompts, "expected at least one prompt to be present"
    first = prompts[0]
    payload = first.to_ui_payload()
    assert payload["id"] == first.id
    assert "prompt" in payload


def test_find_prompt_by_id():
    sample = find_prompt_by_id("analytics.divisions.performance.summary")
    assert sample is not None, "known prompt should load"
    assert sample.raw["blocks"]["system"]
