"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultQualitySummary = exports.defaultQualityService = void 0;
exports.evaluateSurveyQuality = evaluateSurveyQuality;
const validation_1 = require("../validation");
Object.defineProperty(exports, "defaultQualityService", { enumerable: true, get: function () { return validation_1.defaultQualityService; } });
Object.defineProperty(exports, "defaultQualitySummary", { enumerable: true, get: function () { return validation_1.defaultQualitySummary; } });
function evaluateSurveyQuality(ctx) {
    return validation_1.defaultQualityService.evaluate(ctx);
}
