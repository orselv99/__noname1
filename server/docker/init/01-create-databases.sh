#!/bin/bash
set -e

echo "Creating multiple databases..."

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE DATABASE fiery_auth;
    CREATE DATABASE fiery_index;
    
    GRANT ALL PRIVILEGES ON DATABASE fiery_auth TO $POSTGRES_USER;
    GRANT ALL PRIVILEGES ON DATABASE fiery_index TO $POSTGRES_USER;
EOSQL

echo "Multiple databases created successfully!"
