.PHONY: smoke-test fetch train test

smoke-test:
	uv run python scripts/smoke_tests/test_power.py
	uv run python scripts/smoke_tests/test_planetary_computer.py
	uv run python scripts/smoke_tests/test_earthdata.py
	uv run python scripts/smoke_tests/test_bhuvan.py

fetch:
	uv run python scripts/run_pipeline.py

train:
	uv run python scripts/train_models.py

test:
	uv run pytest tests/
