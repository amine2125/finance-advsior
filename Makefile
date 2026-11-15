PY  := backend/.venv/bin/python
PIP := backend/.venv/bin/pip
KIT := context/Datathon2026/alphaforge_starter
KIT_EXT := data/kit

.PHONY: setup data data-refresh test api web web-build e2e lambda deploy demo-accounts

setup:          ## Python 3.12+ environment (AEGIS API + ULYSSE engine), interface and CDK dependencies
	python3 -m venv backend/.venv
	$(PIP) install -q --upgrade pip uv
	$(PIP) install -q -e "backend[api,aws,signals,data,dev]"
	cd frontend && npm install --no-audit --no-fund
	cd infrastructure && npm ci --no-audit --no-fund

data:           ## official dataset for AEGIS (data/active) + ULYSSE datapack (data/build), both from the committed starter kit
	$(PY) scripts/import_datathon_zip.py $(KIT) --out data/active
	cd backend && ULYSSE_KIT_DIR="$(abspath $(KIT))" .venv/bin/python -m ulysse.data.build

data-refresh:   ## official kit extended to yesterday with the kit's own script (Yahoo, Bank of Canada, FRED), then `make data` on it
	$(PY) scripts/extend_kit.py $(KIT) --out $(KIT_EXT)
	$(MAKE) data KIT=$(KIT_EXT)

test:           ## all backend tests (AEGIS + ULYSSE): no AWS, no network, LLM stubbed
	cd backend && .venv/bin/python -m pytest -q

api:            ## API on http://127.0.0.1:8000 (reads .env: Bedrock, Cognito, DynamoDB)
	cd backend && .venv/bin/uvicorn app.main:app --port 8000 --reload

web:            ## interface on http://localhost:5173 (needs `make api`)
	cd frontend && npm run dev

web-build:      ## production build of the interface
	cd frontend && npm run build

e2e:            ## full browser journey against the local stack (`make api` + `make web` running)
	cd frontend && AEGIS_URL=http://localhost:5173 npx playwright test

lambda:         ## Lambda package (Linux wheels, no Docker) with the ULYSSE signals pre-computed
	PATH="$(CURDIR)/backend/.venv/bin:$$PATH" bash scripts/build_lambda.sh

deploy: data-refresh lambda web-build   ## prices extended to yesterday, then deploy to AWS with the CDK (AWS credentials in .env)
	cd backend && .venv/bin/python -c "import app.config, os, subprocess, sys; sys.exit(subprocess.run(['npx', 'cdk', 'deploy', 'AegisStack', '--require-approval', 'never', '--outputs-file', 'cdk-outputs.json'], cwd='../infrastructure', env=os.environ).returncode)"
	$(MAKE) demo-accounts

demo-accounts:  ## create or reset the three jury accounts (Amira, Mateo, Robert) in Cognito
	$(PY) scripts/seed_demo_accounts.py
