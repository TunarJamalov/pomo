"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const dotenv_1 = require("dotenv");
const path_1 = __importDefault(require("path"));
// Try to load local .env for development inside packages/db
(0, dotenv_1.config)({ path: path_1.default.resolve(__dirname, "../.env") });
// Try to load from root/apps if running from elsewhere
(0, dotenv_1.config)();
exports.env = {
    DATABASE_URL: process.env.DATABASE_URL,
};
