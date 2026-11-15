// Node environment. How a farmer types a coordinate (prototype parseCoord), how the one search box tells a name from a
// position, and how F2 writes a coordinate back.
import { describe, it } from "vitest";

describe("parseCoord", () => {
  it.todo("[R15] accepts -6.326, 6.326, +6.326, 6,326 (comma decimal), ' 6.326 ', 6.326 S, 6.326°S, 6.326 s, and a Unicode minus or dash");
  it.todo("[R15] S and W make the value negative; N and E keep it");
  it.todo("[R15] empty -> empty; 'abc' and '6..3' -> not_number");
  it.todo("[R15] E on a latitude and N on a longitude -> wrong_letter; '-6.3 S' -> sign_and_letter");
  it.todo("[R1] latitude 90 and -90 and longitude 180 and -180 are accepted; 90.1 and 180.1 -> out_of_range");
});

describe("classifyQuery", () => {
  it.todo("[R6] one letter is short: nothing would be sent");
  it.todo("[R20] '-6.326, 108.32' and '-6.326 108.32' are the position [108.32, -6.326] (latitude first)");
  it.todo("[R20] '108.32 E, 6.326 S' and '6.326 S 108.32 E' are the same position (letters decide the order)");
  it.todo("[R20] '-6.326, 200' is bad_position longitude out_of_range, not a name search");
  it.todo("[R1] 'Indramayu', 'Nakuru, Kenya', 'São Paulo' and 'Route 66' are names");
  it.todo("[R11] '-16.79, 179.99' and '-16.79, -179.99' are positions on both sides of 180°");
});

describe("rows", () => {
  it.todo("[R15] cornersOfRows reports every bad number at once, in reading order, with row and axis");
  it.todo("[R11] cornersOfRows on the Fiji rows returns corners in drawing space (179.99, 180.01)");
  it.todo("[R23] rowsOfPoints of a field's ring without its closing point gives its corners at 6 decimals with plain minus signs, and cornersOfRows of those rows gives the same shape back");
  it.todo("[R11] rowsOfPoints of a box astride 180° shows every longitude in [-180, 180]");
});

describe("coordsText", () => {
  it.todo("[R13] writes '6.327° S, 108.320° E' with 3 decimals and '6.33° S, 108.32° E' with 2");
  it.todo("writes N and E for zero, and for a value that rounds to zero, and never a minus sign");
});
