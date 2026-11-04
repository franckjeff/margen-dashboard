import { linesFromSheet, mergeLines, type EntryItem } from "./orderTemplate";

const items: EntryItem[] = [
  { id: "i1", item_code: "MEN-TANK", name: "Men's Tank" },
  { id: "i2", item_code: "JR-SS", name: "Junior Short Sleeve" },
];

describe("linesFromSheet", () => {
  it("reads quantities from the size grid, matching items by name or code", () => {
    const { lines, errors } = linesFromSheet(
      [
        ["Item", "S", "M", "XXL", "10"],
        ["men's tank", "2", "", "1", ""],
        ["JR-SS", "", "", "", "4"],
        ["Unused row", "", "", "", ""],
      ],
      items,
    );
    expect(errors).toEqual([]);
    expect(lines).toEqual([
      { item_id: "i1", size: "S", quantity: 2 },
      { item_id: "i1", size: "2XL", quantity: 1 },
      { item_id: "i2", size: "10", quantity: 4 },
    ]);
  });

  it("finds the heading row below a title and lists problems by row", () => {
    const { lines, errors } = linesFromSheet(
      [
        ["MARGEN order"],
        ["Item", "M", "L"],
        ["Hat", "3", ""],
        ["Men's Tank", "two", "0"],
      ],
      items,
    );
    expect(lines).toEqual([]);
    expect(errors).toEqual(['Row 3: "Hat" isn\'t one of our items.', 'Row 4, size M: "two" isn\'t a whole number from 1 to 99999.']);
  });

  it("rejects a file that isn't the template, and an empty one", () => {
    expect(() => linesFromSheet([["Name", "Qty"]], items)).toThrow(/isn't the MARGEN order template/);
    expect(linesFromSheet([["Item", "M"], ["Men's Tank", ""]], items).errors).toEqual(["No quantities are filled in."]);
  });
});

describe("mergeLines", () => {
  it("adds up the same item and size", () => {
    expect(mergeLines([{ item_id: "i1", size: "M", quantity: 2 }], [{ item_id: "i1", size: "M", quantity: 3 }, { item_id: "i1", size: "L", quantity: 1 }])).toEqual([
      { item_id: "i1", size: "M", quantity: 5 },
      { item_id: "i1", size: "L", quantity: 1 },
    ]);
  });
});
