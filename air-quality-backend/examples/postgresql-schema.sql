BEGIN;

CREATE TABLE alembic_version (
    version_num VARCHAR(32) NOT NULL, 
    CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num)
);

-- Running upgrade  -> 0001

CREATE TABLE measurements (
    id SERIAL NOT NULL, 
    measurement_id UUID NOT NULL, 
    device_id VARCHAR(255) NOT NULL, 
    temperature_c FLOAT(53), 
    humidity_pct FLOAT(53), 
    mq135_raw BIGINT, 
    latitude FLOAT(53), 
    longitude FLOAT(53), 
    altitude_m FLOAT(53), 
    gps_accuracy_m FLOAT(53), 
    measured_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    synced BOOLEAN NOT NULL, 
    created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
    PRIMARY KEY (id), 
    CONSTRAINT uq_measurements_measurement_id UNIQUE (measurement_id), 
    CONSTRAINT ck_latitude CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90), 
    CONSTRAINT ck_longitude CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180), 
    CONSTRAINT ck_accuracy CHECK (gps_accuracy_m IS NULL OR gps_accuracy_m >= 0)
);

CREATE INDEX ix_measurements_device_id ON measurements (device_id);

CREATE INDEX ix_measurements_measured_at ON measurements (measured_at);

CREATE INDEX ix_measurements_coordinates ON measurements (latitude, longitude);

CREATE INDEX ix_measurements_device_time ON measurements (device_id, measured_at);

CREATE TABLE processed_measurements (
    measurement_id UUID NOT NULL, 
    status VARCHAR(32) NOT NULL, 
    algorithm_version VARCHAR(100) NOT NULL, 
    air_quality_index FLOAT(53), 
    pollution_level VARCHAR(50), 
    co_ppm FLOAT(53), 
    nh3_ppm FLOAT(53), 
    no2_ppm FLOAT(53), 
    extra_metrics JSON NOT NULL, 
    error_code VARCHAR(100), 
    processed_at TIMESTAMP WITH TIME ZONE, 
    PRIMARY KEY (measurement_id), 
    FOREIGN KEY(measurement_id) REFERENCES measurements (measurement_id) ON DELETE CASCADE
);

CREATE INDEX ix_processed_measurements_status ON processed_measurements (status);

INSERT INTO alembic_version (version_num) VALUES ('0001') RETURNING alembic_version.version_num;

COMMIT;

