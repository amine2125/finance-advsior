PY := backend/.venv/bin/python
PIP := backend/.venv/bin/pip

.PHONY: setup data data-refresh test api web web-build bench lambda lint-infra deploy demo

setup:            ## create the Python environment, install backend and frontend
	python3 -m venv backend/.venv
	$(PIP) install -q --upgrade pip
	$(PIP) install -q -e "backend[data,api,aws,dev]"
	cd frontend && npm install --no-audit --no-fund

data:             ## build the datapack (downloads missing sources into data/cache once)
	cd backend && ../$(PY) -m ulysse.data.build

data-refresh:     ## re-download sources, then rebuild
	cd backend && ../$(PY) -m ulysse.data.build --fetch

test:             ## run the test suite (no AWS, no network, simulated LLM)
	cd backend && ../$(PY) -m pytest

api:              ## local server: API + built interface on http://127.0.0.1:8000
	cd backend && ULYSSE_LLM=simule .venv/bin/uvicorn ulysse.api.server:app --host 127.0.0.1 --port 8000

web:              ## interface in development mode on http://localhost:5173 (needs `make api`)
	cd frontend && npm run dev

web-build:        ## production build of the interface (served by `make api`)
	cd frontend && npm run build

demo:             ## reset the demo state (profiles, Vigie at 2026-11-14) on the local server
	curl -s -X POST -H 'content-type: application/json' -d '{}' http://127.0.0.1:8000/api/demo/reinitialiser > /dev/null && echo "démo réinitialisée"

bench:            ## run the test bench and write bench/resultats/ (served on the Reliability page)
	cd backend && ../$(PY) ../bench/run_bench.py

lambda:           ## build the Lambda package without Docker (Linux arm64 wheels)
	./infra/build_lambda.sh

lint-infra:       ## validate the SAM template locally (no AWS call)
	infra/.venv/bin/cfn-lint infra/template.yaml

deploy:           ## deploy to AWS (phase 7; needs AWS credentials and BUDGET_EMAIL)
	./infra/deploy.sh
