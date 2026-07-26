from __future__ import annotations

import os
from typing import Any

import tensorflow as tf
from flask import Flask, jsonify, request

MAX_CANDIDATES = 50
MAX_TEXT_LENGTH = 5_000


def _rank(query: str, candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    documents = [
        str(candidate.get("text", ""))[:MAX_TEXT_LENGTH]
        for candidate in candidates
    ]
    vectorizer = tf.keras.layers.TextVectorization(
        max_tokens=4_096,
        output_mode="tf_idf",
        standardize="lower_and_strip_punctuation",
    )
    vectorizer.adapt(tf.constant([query, *documents]))
    query_vector = vectorizer(tf.constant([query]))
    document_vectors = vectorizer(tf.constant(documents))
    scores = tf.linalg.matvec(
        tf.math.l2_normalize(document_vectors, axis=1),
        tf.math.l2_normalize(query_vector, axis=1)[0],
    ).numpy()
    ranked = sorted(
        (
            {
                "index": int(candidate["index"]),
                "score": float(scores[position]),
            }
            for position, candidate in enumerate(candidates)
        ),
        key=lambda item: (-item["score"], item["index"]),
    )
    return ranked


def create_app() -> Flask:
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = 512 * 1024

    @app.get("/health")
    def health():
        return jsonify(
            {
                "ok": True,
                "service": "archimedes-context-ranker",
                "tensorflow": tf.__version__,
            }
        )

    @app.post("/rank")
    def rank():
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return jsonify({"error": "A JSON object is required."}), 400
        query = payload.get("query")
        candidates = payload.get("candidates")
        if not isinstance(query, str) or not query.strip():
            return jsonify({"error": "query must be a non-empty string."}), 400
        if (
            not isinstance(candidates, list)
            or not candidates
            or len(candidates) > MAX_CANDIDATES
        ):
            return (
                jsonify(
                    {
                        "error": (
                            "candidates must contain between 1 and "
                            f"{MAX_CANDIDATES} items."
                        )
                    }
                ),
                400,
            )
        if any(
            not isinstance(candidate, dict)
            or not isinstance(candidate.get("index"), int)
            or not isinstance(candidate.get("text"), str)
            for candidate in candidates
        ):
            return jsonify({"error": "Each candidate needs integer index and text."}), 400
        return jsonify({"ranking": _rank(query[:MAX_TEXT_LENGTH], candidates)})

    return app


app = create_app()

if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=int(os.environ.get("PORT", "8080")),
        debug=False,
    )
