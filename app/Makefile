TAG := fakturovac

.PHONY: build, run, test, preview

build:
	docker compose build

test:
	npm test

run:
	docker compose up --remove-orphans

rund:
	docker compose up -d --remove-orphans

kill:
	docker compose -p $(TAG) down

build-and-run: build run

test-and-run: test run

deploy: kill build test rund

deploy-no-kill: build test rund