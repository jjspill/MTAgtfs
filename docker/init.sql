-- Create the arrivals_secondary table
CREATE TABLE arrivals_secondary (
    arrival_id SERIAL PRIMARY KEY,
    stop_id VARCHAR(10),
    arrival_time TIMESTAMP,
    destination VARCHAR(255),
    route_id VARCHAR(50),
    trip_id VARCHAR(255)
);

-- Create the arrivals table
CREATE TABLE arrivals (
    arrival_id SERIAL PRIMARY KEY,
    stop_id VARCHAR(10),
    arrival_time TIMESTAMP,
    destination VARCHAR(255),
    route_id VARCHAR(50),
    trip_id VARCHAR(255)
);
