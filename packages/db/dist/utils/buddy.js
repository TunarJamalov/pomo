"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateBuddyMatchKey = generateBuddyMatchKey;
function generateBuddyMatchKey(reqIdA, reqIdB) {
    const a = Number(reqIdA);
    const b = Number(reqIdB);
    if (!Number.isInteger(a) || !Number.isInteger(b) || a <= 0 || b <= 0)
        return null;
    return a < b ? `${a}:${b}` : `${b}:${a}`;
}
