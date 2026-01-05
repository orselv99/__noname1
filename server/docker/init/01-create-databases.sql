/* Create databases */
CREATE DATABASE fiery_auth;
CREATE DATABASE fiery_index;

/* Grant privileges (assuming standard postgres user) */
GRANT ALL PRIVILEGES ON DATABASE fiery_auth TO postgres;
GRANT ALL PRIVILEGES ON DATABASE fiery_index TO postgres;
