from app.judge_chain import parse_json_or_fallback, score_response


def test_parse_json_or_fallback_valid_json():
    text = '{"score": 92, "reason": "Good answer."}'
    parsed = parse_json_or_fallback(text)
    assert parsed["score"] == 92
    assert parsed["reason"] == "Good answer."


def test_parse_json_or_fallback_numeric_fallback():
    text = "Score: 76 out of 100"
    parsed = parse_json_or_fallback(text)
    assert parsed["score"] == 76
    assert "Score" in parsed["reason"]


def test_score_response_fallback_heuristic():
    score, reason, latency = score_response("fallback-model", "Paris is the capital of France.", "Paris is the capital of France.")
    assert 0 <= score <= 100
    assert isinstance(reason, str)
    assert latency == 0.0
