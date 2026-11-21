import React from 'react';
import { AlertTriangle, Camera, Check, CircleHelp, MessageSquare } from 'lucide-react';
import type { Language, QualityIssue, QuestionAnswer, QuestionDef, QuestionOption } from '../types/survey';
import { isAnswered, isOtherOption, isRequired } from '../survey/surveyModel';

interface QuestionCardProps {
  question: QuestionDef;
  answer?: QuestionAnswer;
  value?: QuestionAnswer;
  language: Language;
  disabled?: boolean;
  required?: boolean;
  showMissing?: boolean;
  contextualHint?: string | null;
  highlightIssues?: QualityIssue[];
  isFocused?: boolean;
  onChange: (next: QuestionAnswer) => void;
}

const isTriggerOption = (opt: QuestionOption) =>
  Boolean(
    opt.specifyText ||
      isOtherOption(opt.en) ||
      isOtherOption(opt.hi) ||
      /(?:^|\s|\b)(?:other|specify)/i.test(opt.en) ||
      /अन्य|विवरण|लिखें/.test(opt.hi) ||
      (opt.code === '5' && (/(?:^|\s|\b)(?:other|details|specify)/i.test(opt.en) || /अन्य|विवरण/.test(opt.hi)))
  );

export const QuestionCard: React.FC<QuestionCardProps> = ({
  question,
  answer,
  value,
  language,
  disabled,
  required: requiredProp,
  showMissing,
  contextualHint,
  highlightIssues,
  isFocused,
  onChange,
}) => {
  const effectiveValue = answer ?? value;
  const hi = language === 'hi';
  const selectedKeys = effectiveValue?.optionKeys ?? [];
  const otherText = effectiveValue?.otherText ?? '';
  const required = requiredProp ?? isRequired(question);
  const missingHighlight = Boolean(showMissing && required && !isAnswered(question, effectiveValue));
  const options = question.options ?? [];

  const optionByKey = new Map(options.map((o) => [o.key, o]));

  const toggleOption = (opt: QuestionOption) => {
    if (disabled) return;
    if (question.type === 'single') {
      const keepOtherText = isTriggerOption(opt) || Boolean(question.alwaysShowDetailInput);
      onChange({
        questionId: question.id,
        optionKeys: [opt.key],
        optionCodes: [opt.code],
        otherText: keepOtherText ? otherText : undefined,
      });
      return;
    }

    if (question.type === 'multi') {
      const exists = selectedKeys.includes(opt.key);
      let nextKeys: string[];
      if (exists) {
        nextKeys = selectedKeys.filter((k) => k !== opt.key);
      } else if (opt.exclusive) {
        nextKeys = [opt.key];
      } else {
        const nonExclusive = selectedKeys.filter((k) => !optionByKey.get(k)?.exclusive);
        nextKeys = [...nonExclusive, opt.key];
      }
      const nextCodes = nextKeys.map((k) => optionByKey.get(k)?.code ?? k);
      const hasTrigger = nextKeys.some((k) => {
        const o = optionByKey.get(k);
        return o ? isTriggerOption(o) : false;
      });
      onChange({
        questionId: question.id,
        optionKeys: nextKeys,
        optionCodes: nextCodes,
        otherText: hasTrigger || question.alwaysShowDetailInput ? otherText : undefined,
      });
      return;
    }

    // Legacy 2-rank mode (q40 if ever used)
    if (question.type === 'q40') {
      const exists = selectedKeys.includes(opt.key);
      let nextKeys: string[];
      if (exists) {
        nextKeys = selectedKeys.filter((k) => k !== opt.key);
      } else if (selectedKeys.length >= 2) {
        nextKeys = [selectedKeys[0], opt.key];
      } else {
        nextKeys = [...selectedKeys, opt.key];
      }
      onChange({
        questionId: question.id,
        optionKeys: nextKeys,
        optionCodes: nextKeys.map((k) => optionByKey.get(k)?.code ?? k),
      });
    }
  };

  const setTextAnswer = (text: string) => {
    onChange({
      questionId: question.id,
      optionKeys: [],
      optionCodes: [],
      otherText: text,
    });
  };

  const setDetailText = (text: string) => {
    onChange({
      questionId: question.id,
      optionKeys: selectedKeys,
      optionCodes: effectiveValue?.optionCodes ?? selectedKeys.map((k) => optionByKey.get(k)?.code ?? k),
      otherText: text,
    });
  };

  const isIsoDate = /^\d{4}-\d{2}-\d{2}$/.test(otherText.trim());
  const textWordCount = otherText.trim() ? otherText.trim().split(/\s+/).length : 0;
  const shouldShowAlwaysDetail =
    Boolean(question.alwaysShowDetailInput) &&
    question.type !== 'date' &&
    !(question.id === 'Q3a' && selectedKeys.length === 1 && selectedKeys[0] === '1');

  return (
    <div
      id={`q-${question.id}`}
      className={`bg-white rounded-[14px] border p-4 shadow-[0_1px_2px_rgba(24,22,17,0.04)] transition ${
        isFocused
          ? 'border-[#D9AE00] ring-2 ring-[#FDC513]/40'
          : missingHighlight || (highlightIssues && highlightIssues.length > 0)
            ? 'border-[#C93B32]'
            : 'border-[#E7E2D4]'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-[#FAF8F2] border border-[#E7E2D4] text-[11px] font-bold font-mono text-[#726C5D]">
              {question.id}
            </span>
            {required ? (
              <span className="text-[11px] font-medium text-[#726C5D]">{hi ? 'आवश्यक' : 'Required'}</span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#726C5D]">
                <MessageSquare className="w-3 h-3" /> {hi ? 'वैकल्पिक विवरण' : 'Open-Ended (Verbatim)'}
              </span>
            )}
            {question.type === 'multi' && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-[#EAF2FF] text-[#2F6FED] text-[10.5px] font-bold">
                {hi ? 'एक से अधिक चुनें' : 'Select All That Apply'}
              </span>
            )}
          </div>
          <h3 className="text-[15.5px] font-semibold leading-snug text-[#181611]">
            {hi ? question.hi : question.en}
          </h3>
          {hi && <p className="text-[12px] text-[#726C5D] mt-0.5">{question.en}</p>}
          {(question.conditionalHintEn || question.conditionalHintHi) && (
            <p className="text-[12px] text-[#8E5B00] bg-[#FFF8DB] border border-[#F3DE7A] rounded-lg px-2.5 py-1.5 mt-2 flex items-start gap-1.5">
              <CircleHelp className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{hi ? question.conditionalHintHi || question.conditionalHintEn : question.conditionalHintEn}</span>
            </p>
          )}
        </div>
      </div>

      {question.type === 'text' ? (
        <div>
          <textarea
            rows={4}
            disabled={disabled}
            value={otherText}
            onChange={(e) => setTextAnswer(e.target.value)}
            placeholder={
              hi
                ? question.placeholderHi || 'यहाँ परिवार के उत्तर लिखें...'
                : question.placeholderEn || 'Write response in household words (narrative verbatim)...'
            }
            className="w-full rounded-[10px] border border-[#E7E2D4] bg-white p-3 text-[14px] text-[#181611] placeholder-[#A8A08C] focus:outline-none focus:ring-2 focus:ring-[#FDC513]/40 focus:border-[#D9AE00] disabled:bg-[#FAF8F2]"
          />
          <p className="text-[11.5px] text-[#726C5D] mt-1">
            {textWordCount > 0 ? `${textWordCount} ${hi ? 'शब्द' : 'words'}` : hi ? 'संक्षिप्त या विस्तृत उत्तर लिखें' : 'Optional narrative field'}
          </p>
        </div>
      ) : question.type === 'date' ? (
        <div className="space-y-3">
          <div>
            <label className="block text-[12px] font-semibold text-[#726C5D] mb-1">
              {hi ? 'सटीक तारीख चुनें (यदि याद हो)' : 'Exact Date of Eviction (DD/MM/YYYY)'}
            </label>
            <input
              type="date"
              disabled={disabled}
              value={isIsoDate ? otherText.trim() : ''}
              onChange={(e) => setTextAnswer(e.target.value)}
              className="w-full h-11 rounded-[10px] border border-[#E7E2D4] bg-white px-3 text-[14px] text-[#181611] focus:outline-none focus:ring-2 focus:ring-[#FDC513]/40 focus:border-[#D9AE00] disabled:bg-[#FAF8F2]"
            />
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-[#726C5D] mb-1">
              {hi
                ? question.detailPromptHi || 'या महीना / वर्ष लिखें (यदि तारीख याद नहीं है)'
                : question.detailPromptEn || 'Or type Month / Year if exact date is unknown'}
            </label>
            <input
              type="text"
              disabled={disabled}
              value={isIsoDate ? '' : otherText}
              onChange={(e) => setTextAnswer(e.target.value)}
              placeholder={hi ? 'जैसे: जुलाई 2025 या मानसून 2024' : 'e.g., July 2025 or Monsoon 2024'}
              className="w-full h-11 rounded-[10px] border border-[#E7E2D4] bg-[#FFFDF5] px-3 text-[14px] text-[#181611] placeholder-[#A8A08C] focus:outline-none focus:ring-2 focus:ring-[#FDC513]/40 focus:border-[#D9AE00] disabled:bg-[#FAF8F2]"
            />
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {options.map((opt) => {
            const isSelected = selectedKeys.includes(opt.key);
            const showBlankInput = isSelected && isTriggerOption(opt);
            const isMulti = question.type === 'multi';

            return (
              <div key={opt.key} className="space-y-1.5">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => toggleOption(opt)}
                  className={`w-full text-left px-3.5 py-2.5 rounded-[10px] border transition-colors flex items-center gap-3 min-h-[46px] ${
                    isSelected
                      ? 'bg-[#FFF5C4] border-[#D9AE00] text-[#181611] font-semibold'
                      : 'bg-white border-[#E7E2D4] text-[#181611] hover:bg-[#FAF8F2]'
                  } disabled:opacity-60`}
                >
                  <span
                    className={`w-6 h-6 shrink-0 flex items-center justify-center text-[11.5px] font-bold border ${
                      isMulti ? 'rounded-md' : 'rounded-full'
                    } ${
                      isSelected
                        ? 'bg-[#FDC513] border-[#D9AE00] text-[#181611]'
                        : 'bg-[#FAF8F2] border-[#D7D1C2] text-[#726C5D]'
                    }`}
                  >
                    {isMulti ? (isSelected ? <Check className="w-3.5 h-3.5" /> : opt.code) : opt.code}
                  </span>
                  <span className="flex-1 text-[14px] leading-snug">{hi ? opt.hi : opt.en}</span>
                  {isSelected && !isMulti && <Check className="w-4 h-4 text-[#181611] shrink-0" />}
                </button>

                {showBlankInput && (
                  <div className="pl-3 pr-1 pb-1">
                    <label className="block text-[11.5px] font-semibold text-[#8E5B00] mb-1">
                      {hi
                        ? opt.specifyPromptHi || 'कृपया यहाँ विवरण टाइप करें:'
                        : opt.specifyPromptEn || 'Please specify details below:'}
                    </label>
                    <input
                      type="text"
                      autoFocus
                      disabled={disabled}
                      value={otherText}
                      onChange={(e) => setDetailText(e.target.value)}
                      placeholder={
                        hi
                          ? opt.specifyPromptHi || 'यहाँ टाइप करें...'
                          : opt.specifyPromptEn || 'Type exact details here...'
                      }
                      className="w-full h-11 rounded-[10px] border border-[#D9AE00] bg-[#FFFDF5] px-3 text-[14px] text-[#181611] placeholder-[#9B8F74] focus:outline-none focus:ring-2 focus:ring-[#FDC513]/40 disabled:bg-[#FAF8F2]"
                    />
                  </div>
                )}
              </div>
            );
          })}

          {shouldShowAlwaysDetail && (
            <div className="pt-2">
              <label className="block text-[12px] font-semibold text-[#726C5D] mb-1">
                {hi
                  ? question.detailPromptHi || 'अतिरिक्त विवरण लिखें'
                  : question.detailPromptEn || 'Additional Details'}
              </label>
              <input
                type="text"
                disabled={disabled}
                value={otherText}
                onChange={(e) => setDetailText(e.target.value)}
                placeholder={
                  hi
                    ? question.detailPromptHi || 'यहाँ विवरण लिखें...'
                    : question.detailPromptEn || 'Type details here...'
                }
                className="w-full h-11 rounded-[10px] border border-[#E7E2D4] bg-[#FFFDF5] px-3 text-[14px] text-[#181611] placeholder-[#A8A08C] focus:outline-none focus:ring-2 focus:ring-[#FDC513]/40 focus:border-[#D9AE00] disabled:bg-[#FAF8F2]"
              />
            </div>
          )}
        </div>
      )}

      {(question.photoHintEn || question.photoHintHi) && (
        <div className="mt-3 rounded-[10px] bg-[#EAF2FF] border border-[#C7DAFA] px-3 py-2 flex items-start gap-2 text-[12px] text-[#1E4799]">
          <Camera className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{hi ? question.photoHintHi || question.photoHintEn : question.photoHintEn}</span>
        </div>
      )}

      {contextualHint && (
        <p className="mt-2.5 text-[12px] text-[#5C5547] bg-[#FAF8F2] border border-[#E7E2D4] rounded-[10px] px-3 py-2">
          {contextualHint}
        </p>
      )}

      {highlightIssues && highlightIssues.length > 0 && (
        <div className="mt-2.5 space-y-1.5">
          {highlightIssues.map((iss) => (
            <div
              key={iss.id}
              className={`rounded-[10px] px-3 py-2 text-[12px] flex items-start gap-2 border ${
                iss.severity === 'error'
                  ? 'bg-[#FDECEA] border-[#F5C6C2] text-[#9E241C]'
                  : 'bg-[#FFF5E0] border-[#F6E19C] text-[#7A5600]'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{iss.detail}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
