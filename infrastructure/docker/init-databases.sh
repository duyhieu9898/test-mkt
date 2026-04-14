#!/bin/bash
# Postgres init script — creates the Langfuse database alongside oneperson.
# Runs only on first startup of a fresh Postgres volume.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
  CREATE DATABASE langfuse;
EOSQL
