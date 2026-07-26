import unittest

from app import create_app


class RankerTest(unittest.TestCase):
    def setUp(self):
        self.client = create_app().test_client()

    def test_health(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.get_json()["ok"])

    def test_rank(self):
        response = self.client.post(
            "/rank",
            json={
                "query": "Python API",
                "candidates": [
                    {"index": 0, "text": "KiCad circuit board"},
                    {"index": 1, "text": "Python REST API"},
                ],
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["ranking"][0]["index"], 1)

    def test_rejects_invalid_input(self):
        response = self.client.post("/rank", json={"query": "", "candidates": []})
        self.assertEqual(response.status_code, 400)


if __name__ == "__main__":
    unittest.main()
