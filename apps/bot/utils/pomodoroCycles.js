/**
 * Pomodoro cycle rules shared by /pomodoro's transitions. Classic Pomodoro: when a
 * long break is set, the break after every 4th work cycle is the long one.
 */
const LONG_BREAK_EVERY = 4;

/** Is the break after this work cycle the long one? */
function isLongBreakAfter(pomData) {
    return Boolean(pomData?.longBreak) && pomData.cycle % LONG_BREAK_EVERY === 0;
}

/** Minutes of the break that follows the current work cycle. */
function breakMinutesAfter(pomData) {
    return isLongBreakAfter(pomData) ? pomData.longBreak : pomData.break;
}

module.exports = { LONG_BREAK_EVERY, isLongBreakAfter, breakMinutesAfter };
