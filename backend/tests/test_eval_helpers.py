import pytest
from app.eval_engine import rule_based_scores, sentence_similarity, parse_score_from_text

def test_sentence_similarity_identical():
    a = "The quick brown fox"
    b = "The quick brown fox"
    assert sentence_similarity(a, b) > 90

def test_sentence_similarity_different():
    a = "apple orange banana"
    b = "table chair lamp"
    assert sentence_similarity(a, b) < 10

def test_rule_based_scores():
    ref = "Paris is the capital of France"
    resp = "The capital of France is Paris"
    r = rule_based_scores(ref, resp)
    assert r["keyword_overlap"] >= 50
    assert r["similarity"] > 50

def test_parse_score_from_text():
    assert parse_score_from_text("Score: 85") == 85.0
    assert parse_score_from_text("85 out of 100") == 85.0
