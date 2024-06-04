import { parse } from 'csv-parse/sync';
import { readFileSync } from 'fs';
import path from 'path';

export const getStopsCSV = () => {
  // let csvPath = path.join('/opt', 'stops.csv');
  const csvPath = path.join(__dirname, 'stops.csv');
  const stationInfo = readFileSync(csvPath, 'utf-8');

  return parse(stationInfo, {
    columns: true,
    skip_empty_lines: true,
  });
};

export const getStationName = (stops: any, stationId: string) => {
  const station = stops.find((stop: any) => stop.stop_id === stationId);
  return station ? station.stop_name : '';
};

export const getTripName = (trips: any[], tripId: string): string => {
  const trip = trips.find((trip) => trip.trip_id.includes(tripId));
  return trip ? trip.trip_headsign : 'Trip not found';
};
