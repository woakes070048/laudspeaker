#!/bin/bash
set -e

export SENTRY_RELEASE=$(cat SENTRY_RELEASE)

# Web server runs first. All other process types are dependant on the web server container
if [[ "$1" = 'web' || -z "$1" ]]; then
	export LAUDSPEAKER_PROCESS_TYPE="WEB"

	echo "Running setup_config.sh"
	bash ./scripts/setup_config.sh

	echo "Running clickhouse-migrations"
	clickhouse-migrations migrate

	echo "Running Typeorm migrations"
	typeorm-ts-node-commonjs migration:run -d packages/server/src/data-source.ts
fi

if [[ "$1" = 'queue' ]]; then
	export LAUDSPEAKER_PROCESS_TYPE="QUEUE"
fi

if [[ "$1" = 'cron' ]]; then
	export LAUDSPEAKER_PROCESS_TYPE="CRON"
fi

echo "Starting LaudSpeaker Process: $LAUDSPEAKER_PROCESS_TYPE"
node dist/src/main.js
