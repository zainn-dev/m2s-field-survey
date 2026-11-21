import React from 'react';
import { Check, ChevronDown, Minus, Plus } from 'lucide-react';
import { PART1_LABELS, PART1_OPTIONS } from '../data/questionnaire';
import type { ClusterItem, HouseholdProfile, Language } from '../types/survey';
import { Last4Input } from './Last4Input';

type ProfileKey = keyof HouseholdProfile;
type SetField = <K extends ProfileKey>(key: K, value: HouseholdProfile[K]) => void;
export type SetFields = (patch: Partial<HouseholdProfile>) => void;

export interface GenderCounts {
  male: number;
  female: number;
  other: number;
}

export interface AgeCounts {
  ageUnder1: number;
  age1to5: number;
  age6to14: number;
  age15to17: number;
  age18to59: number;
  age60Plus: number;
}

export function balanceGender(current: GenderCounts, targetTotal: number): GenderCounts {
  let male = Math.max(0, current.male || 0);
  let female = Math.max(0, current.female || 0);
  let other = Math.max(0, current.other || 0);
  const target = Math.max(0, targetTotal || 0);

  let diff = target - (male + female + other);

  if (diff > 0) {
    while (diff > 0) {
      if (female < male) {
        female += 1;
      } else {
        male += 1;
      }
      diff -= 1;
    }
  } else if (diff < 0) {
    let toRemove = -diff;
    while (toRemove > 0 && male + female + other > 0) {
      if (other > 0) {
        other -= 1;
        toRemove -= 1;
      } else if (male > female && male > 0) {
        male -= 1;
        toRemove -= 1;
      } else if (female > 0) {
        female -= 1;
        toRemove -= 1;
      } else if (male > 0) {
        male -= 1;
        toRemove -= 1;
      } else {
        break;
      }
    }
  }

  if (target > 0 && male + female + other === 0) {
    male = target;
  }

  return { male, female, other };
}

export function balanceAgeGroups(current: AgeCounts, targetTotal: number): AgeCounts {
  let ageUnder1 = Math.max(0, current.ageUnder1 || 0);
  let age1to5 = Math.max(0, current.age1to5 || 0);
  let age6to14 = Math.max(0, current.age6to14 || 0);
  let age15to17 = Math.max(0, current.age15to17 || 0);
  let age18to59 = Math.max(0, current.age18to59 || 0);
  let age60Plus = Math.max(0, current.age60Plus || 0);
  const target = Math.max(0, targetTotal || 0);

  const currentSum = ageUnder1 + age1to5 + age6to14 + age15to17 + age18to59 + age60Plus;
  let diff = target - currentSum;

  if (diff > 0) {
    age18to59 += diff;
  } else if (diff < 0) {
    let toRemove = -diff;
    const removeFrom = (val: number): number => {
      const take = Math.min(val, toRemove);
      toRemove -= take;
      return val - take;
    };
    age18to59 = removeFrom(age18to59);
    if (toRemove > 0) age6to14 = removeFrom(age6to14);
    if (toRemove > 0) age15to17 = removeFrom(age15to17);
    if (toRemove > 0) age1to5 = removeFrom(age1to5);
    if (toRemove > 0) age60Plus = removeFrom(age60Plus);
    if (toRemove > 0) ageUnder1 = removeFrom(ageUnder1);
  }

  if (target > 0 && ageUnder1 + age1to5 + age6to14 + age15to17 + age18to59 + age60Plus === 0) {
    age18to59 = target;
  }

  return { ageUnder1, age1to5, age6to14, age15to17, age18to59, age60Plus };
}

interface Opt {
  key: string;
  code: string;
  en: string;
  hi: string;
  specifyText?: boolean;
  exclusive?: boolean;
}

const isOptOther = (o?: Opt) =>
  Boolean(
    o &&
      (o.specifyText ||
        /(?:^|\s|\b)(?:other|specify)/i.test(o.en) ||
        /अन्य|विवरण|लिखें/.test(o.hi) ||
        o.code === '5' ||
        o.code === '16' ||
        o.code === '7' ||
        o.code === '6')
  );

const BlockCard: React.FC<{
  badge: string;
  title: string;
  required?: boolean;
  missing?: boolean;
  children: React.ReactNode;
}> = ({ badge, title, required, missing, children }) => (
  <div
    className={`bg-white rounded-[14px] border p-4 shadow-[0_1px_2px_rgba(24,22,17,0.04)] ${
      missing ? 'border-[#C93B32]' : 'border-[#E7E2D4]'
    }`}
  >
    <div className="flex items-center justify-between gap-2 mb-3">
      <div className="flex items-center gap-2">
        <span className="px-2 py-0.5 rounded-md bg-[#FAF8F2] border border-[#E7E2D4] text-[11px] font-bold font-mono text-[#726C5D]">
          {badge}
        </span>
        <h3 className="text-[14.5px] font-bold text-[#181611]">{title}</h3>
      </div>
      {required && (
        <span className={`text-[11px] font-semibold ${missing ? 'text-[#C93B32]' : 'text-[#726C5D]'}`}>
          {missing ? 'Missing *' : 'Required *'}
        </span>
      )}
    </div>
    {children}
  </div>
);

const Stepper: React.FC<{
  label: string;
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  disabledPlus?: boolean;
}> = ({ label, value, onChange, min = 0, max, disabledPlus = false }) => {
  const isMinusDisabled = value <= min;
  const isPlusDisabled = disabledPlus || (max !== undefined && value >= max);

  return (
    <div className="flex items-center justify-between py-2 border-b border-[#F2EFE7] last:border-0">
      <span className="text-[13.5px] font-medium text-[#181611]">{label}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          aria-label={`Decrease ${label}`}
          disabled={isMinusDisabled}
          className="w-9 h-9 rounded-lg border border-[#E7E2D4] bg-[#FAF8F2] flex items-center justify-center text-[#181611] active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Minus className="w-4 h-4" />
        </button>
        <span className="w-9 text-center font-bold font-mono text-[15px] text-[#181611]">{value}</span>
        <button
          type="button"
          onClick={() => {
            if (!isPlusDisabled) {
              const next = max !== undefined ? Math.min(max, value + 1) : value + 1;
              onChange(next);
            }
          }}
          aria-label={`Increase ${label}`}
          disabled={isPlusDisabled}
          className="w-9 h-9 rounded-lg border border-[#E7E2D4] bg-[#FAF8F2] flex items-center justify-center text-[#181611] active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

const RadioGroup: React.FC<{
  options: Opt[];
  value: string;
  onChange: (code: string) => void;
  language: Language;
  specifyValue?: string;
  specifyPlaceholder?: string;
  onSpecifyChange?: (v: string) => void;
  columns?: 1 | 2;
}> = ({
  options,
  value,
  onChange,
  language,
  specifyValue = '',
  specifyPlaceholder,
  onSpecifyChange,
  columns = 1,
}) => {
  const hi = language === 'hi';
  return (
    <div className={columns === 2 ? 'grid grid-cols-1 sm:grid-cols-2 gap-1.5' : 'space-y-1.5'}>
      {options.map((o) => {
        const selected = value === o.code;
        const isOther = isOptOther(o);
        const showBlank = selected && isOther && Boolean(onSpecifyChange);
        return (
          <div key={o.code} className={showBlank && columns === 2 ? 'sm:col-span-2 space-y-1.5' : 'space-y-1.5'}>
            <button
              type="button"
              onClick={() => {
                onChange(o.code);
                if (!isOther && onSpecifyChange) onSpecifyChange('');
              }}
              className={`w-full text-left px-3 py-2.5 rounded-[10px] border flex items-center gap-2.5 min-h-[44px] text-[13.5px] ${
                selected
                  ? 'bg-[#FFF5C4] border-[#D9AE00] font-semibold text-[#181611]'
                  : 'bg-white border-[#E7E2D4] text-[#181611] hover:bg-[#FAF8F2]'
              }`}
            >
              <span
                className={`w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[11px] font-bold border ${
                  selected
                    ? 'bg-[#FDC513] border-[#D9AE00] text-[#181611]'
                    : 'bg-[#FAF8F2] border-[#D7D1C2] text-[#726C5D]'
                }`}
              >
                {o.code}
              </span>
              <span className="flex-1">{hi ? o.hi : o.en}</span>
              {selected && <Check className="w-4 h-4 text-[#181611] shrink-0" />}
            </button>
            {showBlank && (
              <div className="pl-2 pt-1">
                <input
                  type="text"
                  autoFocus
                  value={specifyValue}
                  onChange={(e) => onSpecifyChange?.(e.target.value)}
                  placeholder={specifyPlaceholder || (hi ? 'कृपया यहाँ विवरण टाइप करें...' : 'Please specify details here...')}
                  className="w-full h-11 rounded-[10px] border border-[#D9AE00] bg-[#FFFDF5] px-3 text-[14px] text-[#181611] placeholder-[#9B8F74] focus:outline-none focus:ring-2 focus:ring-[#FDC513]/40"
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

const SelectDropdown: React.FC<{
  options: Opt[];
  value: string;
  onChange: (code: string) => void;
  language: Language;
  placeholder?: string;
  specifyValue?: string;
  specifyPlaceholder?: string;
  onSpecifyChange?: (v: string) => void;
}> = ({
  options,
  value,
  onChange,
  language,
  placeholder,
  specifyValue = '',
  specifyPlaceholder,
  onSpecifyChange,
}) => {
  const hi = language === 'hi';
  const selectedOpt = options.find((o) => o.code === value);
  const isOther = isOptOther(selectedOpt);
  const showBlank = Boolean(isOther) && Boolean(onSpecifyChange);

  return (
    <div className="space-y-2">
      <div className="relative">
        <select
          value={value}
          onChange={(e) => {
            const nextCode = e.target.value;
            const nextOpt = options.find((o) => o.code === nextCode);
            onChange(nextCode);
            if (!isOptOther(nextOpt) && onSpecifyChange) onSpecifyChange('');
          }}
          className={`w-full h-11 appearance-none rounded-[10px] border pl-3.5 pr-10 text-[14px] transition focus:outline-none focus:ring-2 focus:ring-[#FDC513]/40 ${
            value
              ? 'bg-[#FFFDF2] border-[#D9AE00] font-semibold text-[#181611]'
              : 'bg-white border-[#E7E2D4] text-[#726C5D]'
          }`}
        >
          <option value="">{placeholder || (hi ? '— विकल्प चुनें —' : '— Select an option —')}</option>
          {options.map((o) => (
            <option key={o.code} value={o.code}>
              {o.code}. {hi ? o.hi : o.en}
            </option>
          ))}
        </select>
        <ChevronDown className="w-4 h-4 text-[#726C5D] pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2" />
      </div>

      {showBlank && (
        <div className="pt-1">
          <label className="block text-[11.5px] font-semibold text-[#8E5B00] mb-1">
            {hi ? 'कृपया यहाँ विवरण टाइप करें:' : 'Please specify details below:'}
          </label>
          <input
            type="text"
            autoFocus
            value={specifyValue}
            onChange={(e) => onSpecifyChange?.(e.target.value)}
            placeholder={specifyPlaceholder || (hi ? 'कृपया यहाँ विवरण टाइप करें...' : 'Please specify details here...')}
            className="w-full h-11 rounded-[10px] border border-[#D9AE00] bg-[#FFFDF5] px-3 text-[14px] text-[#181611] placeholder-[#9B8F74] focus:outline-none focus:ring-2 focus:ring-[#FDC513]/40"
          />
        </div>
      )}
    </div>
  );
};

interface HouseholdProfileSectionProps {
  profile: HouseholdProfile;
  setField: SetField;
  setFields?: SetFields;
  language: Language;
  surveyCode: string;
  clusters: ClusterItem[];
  /** Highlights required fields that are still empty. */
  showErrors?: boolean;
}

export const HouseholdProfileSection: React.FC<HouseholdProfileSectionProps> = ({
  profile,
  setField,
  setFields,
  language,
  surveyCode,
  clusters,
  showErrors,
}) => {
  const hi = language === 'hi';
  const lbl = (k: keyof typeof PART1_LABELS) => (hi ? PART1_LABELS[k].hi : PART1_LABELS[k].en);

  const genderSum = profile.maleCount + profile.femaleCount + profile.otherGenderCount;
  const ageUnder1 = profile.ageUnder1 ?? 0;
  const age1to5 = profile.age1to5 ?? Math.max(0, profile.age0to5 - ageUnder1);
  const ageSum = ageUnder1 + age1to5 + profile.age6to14 + profile.age15to17 + profile.age18to59 + profile.age60Plus;

  const applyPatch = (patch: Partial<HouseholdProfile>) => {
    if (setFields) {
      setFields(patch);
    } else {
      for (const [k, v] of Object.entries(patch)) {
        setField(k as ProfileKey, v as any);
      }
    }
  };

  const handleTotalMembersChange = (nextTotal: number) => {
    const validTotal = Math.max(1, Math.floor(Number(nextTotal) || 1));
    setField('totalMembers', validTotal);
  };

  const handleGenderChange = (key: 'maleCount' | 'femaleCount' | 'otherGenderCount', val: number) => {
    const currentVal = profile[key] || 0;
    const nextVal = Math.max(0, Math.floor(Number(val) || 0));
    if (nextVal > currentVal) {
      const added = nextVal - currentVal;
      if (genderSum + added > profile.totalMembers) {
        return;
      }
    }
    setField(key, nextVal);
  };

  const handleAgeChange = (
    key: 'ageUnder1' | 'age1to5' | 'age6to14' | 'age15to17' | 'age18to59' | 'age60Plus',
    val: number
  ) => {
    const currentVal = key === 'ageUnder1' ? ageUnder1 : key === 'age1to5' ? age1to5 : (profile[key] || 0);
    const nextVal = Math.max(0, Math.floor(Number(val) || 0));
    if (nextVal > currentVal) {
      const added = nextVal - currentVal;
      if (ageSum + added > profile.totalMembers) {
        return;
      }
    }
    if (key === 'ageUnder1') {
      applyPatch({
        ageUnder1: nextVal,
        age0to5: nextVal + age1to5,
      });
    } else if (key === 'age1to5') {
      applyPatch({
        age1to5: nextVal,
        age0to5: ageUnder1 + nextVal,
      });
    } else {
      setField(key, nextVal);
    }
  };

  const toggleVulnerable = (code: string) => {
    const cur = profile.vulnerableCodes ?? [];
    if (code === '0') {
      setField('vulnerableCodes', cur.includes('0') ? [] : ['0']);
      setField('vulnerableOther', '');
      return;
    }
    const base = cur.filter((c) => c !== '0');
    const next = base.includes(code) ? base.filter((c) => c !== code) : [...base, code];
    setField('vulnerableCodes', next);
    if (!next.some((c) => c === '6' || c === '7')) setField('vulnerableOther', '');
  };

  const toggleLanguage = (code: string) => {
    const current = profile.primaryLanguageCodes && profile.primaryLanguageCodes.length > 0
      ? profile.primaryLanguageCodes
      : (profile.primaryLanguageCode ? profile.primaryLanguageCode.split(',').filter(Boolean) : []);
    const next = current.includes(code)
      ? current.filter((c) => c !== code)
      : [...current, code];
    setField('primaryLanguageCodes', next);
    setField('primaryLanguageCode', next.join(','));
    if (!next.includes('5')) setField('primaryLanguageOther', '');
  };

  const missingDistrict = Boolean(showErrors && !(profile.districtCode || '').trim());
  const missingDoc = Boolean(showErrors && !profile.docVerifiedCode.trim());
  const missingHead = Boolean(showErrors && !profile.headName.trim());
  const missingHeadStatus = Boolean(showErrors && !profile.headStatusCode.trim());
  const missingIncome = Boolean(showErrors && !profile.incomeNowCode.trim());
  const missingLand = Boolean(showErrors && !(profile.landOwnedCode || '').trim());
  const missingB4 = Boolean(
    showErrors && (
      profile.totalMembers < 1 ||
      genderSum !== profile.totalMembers ||
      ageSum !== profile.totalMembers
    )
  );

  return (
    <div className="space-y-4">
      {/* Tracking header */}
      <BlockCard badge="META" title={hi ? 'सर्वे विवरण और क्लस्टर' : 'Survey Metadata & Assigned Cluster'}>
        <div className="grid grid-cols-2 gap-3 text-[13px] mb-3">
          <div className="bg-[#FAF8F2] rounded-lg px-3 py-2 border border-[#E7E2D4]">
            <div className="text-[11px] text-[#726C5D] font-semibold">Survey Code</div>
            <div className="font-mono font-bold text-[#181611] truncate">{surveyCode || profile.surveyCode}</div>
          </div>
          <div className="bg-[#FAF8F2] rounded-lg px-3 py-2 border border-[#E7E2D4]">
            <div className="text-[11px] text-[#726C5D] font-semibold">{hi ? 'तारीख' : 'Survey Date'}</div>
            <input
              type="date"
              value={profile.surveyDate}
              onChange={(e) => setField('surveyDate', e.target.value)}
              className="w-full bg-transparent font-mono font-semibold text-[#181611] focus:outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[12px] font-semibold text-[#726C5D] mb-1">
              {hi ? 'सर्वेक्षक का नाम' : 'Interviewer Name'}
            </label>
            <input
              type="text"
              value={profile.interviewer}
              onChange={(e) => setField('interviewer', e.target.value)}
              className="w-full h-10 rounded-[10px] border border-[#E7E2D4] px-3 text-[13.5px]"
            />
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-[#726C5D] mb-1">
              {hi ? 'क्लस्टर / राहत शिविर (Assignment)' : 'Field Cluster / Relief Camp'}
            </label>
            <select
              value={profile.clusterId}
              onChange={(e) => {
                const selected = clusters.find((c) => c.id === e.target.value);
                setField('clusterId', e.target.value);
                if (selected) setField('clusterName', selected.name);
              }}
              className="w-full h-10 rounded-[10px] border border-[#E7E2D4] bg-white px-3 text-[13.5px]"
            >
              {clusters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
          </div>
        </div>
      </BlockCard>

      {/* B1 */}
      <BlockCard badge="B1" title={lbl('B1')} required missing={missingDistrict}>
        <p className="text-[12px] text-[#726C5D] mb-2">
          {hi ? 'असम का ज़िला चुनें (1–16):' : 'Select District in Assam (1–16):'}
        </p>
        <SelectDropdown
          options={PART1_OPTIONS.b1Districts}
          value={profile.districtCode || ''}
          onChange={(v) => setField('districtCode', v)}
          language={language}
          placeholder={hi ? '— ज़िला चुनें (1–16) —' : '— Select District (1–16) —'}
          specifyValue={profile.districtOther || ''}
          specifyPlaceholder={hi ? 'ज़िले का नाम लिखें...' : 'Specify exact District name...'}
          onSpecifyChange={(v) => setField('districtOther', v)}
        />
        <div className="mt-3">
          <label className="block text-[12px] font-semibold text-[#726C5D] mb-1">
            {hi ? 'गाँव / राहत शिविर का नाम' : 'Village / Relief Camp Name'}
          </label>
          <input
            type="text"
            value={profile.revenueCircleVillage || ''}
            onChange={(e) => setField('revenueCircleVillage', e.target.value)}
            placeholder={hi ? 'जैसे: बैसारी गांव / शिविर' : 'e.g., Evicted Village / Camp'}
            className="w-full h-11 rounded-[10px] border border-[#E7E2D4] px-3 text-[14px]"
          />
        </div>
      </BlockCard>

      {/* B2 */}
      <BlockCard badge="B2" title={lbl('B2')} required missing={missingDoc}>
        <p className="text-[12px] text-[#726C5D] mb-2">
          {hi ? 'सत्यापन के लिए देखा गया पहचान पत्र चुनें (Dropdown):' : 'Select Identity Document Verified (Dropdown):'}
        </p>
        <SelectDropdown
          options={PART1_OPTIONS.b2DocVerified}
          value={profile.docVerifiedCode || ''}
          onChange={(v) => {
            const opt = PART1_OPTIONS.b2DocVerified.find((o) => o.code === v);
            setField('docVerifiedCode', v);
            setField('docVerifiedLabel', opt ? (hi ? opt.hi : opt.en) : '');
            if (v !== '1') setField('idLast4', '');
            if (v !== '7') setField('docVerifiedOther', '');
          }}
          language={language}
          placeholder={hi ? '— सत्यापन पहचान पत्र चुनें —' : '— Select Verified ID Document —'}
          specifyValue={profile.docVerifiedOther || ''}
          specifyPlaceholder={hi ? 'अन्य दस्तावेज़ का नाम लिखें...' : 'Specify Other ID document name...'}
          onSpecifyChange={(v) => setField('docVerifiedOther', v)}
        />

        {profile.docVerifiedCode === '1' && (
          <div className="mt-3 p-3 rounded-[10px] bg-[#FAF8F2] border border-[#E7E2D4]">
            <Last4Input
              id="profile-aadhaar-last4"
              value={profile.idLast4}
              onChange={(v) => setField('idLast4', v)}
              label={hi ? 'आधार कार्ड के अंतिम 4 अंक (पूरा नंबर न लिखें)' : 'Aadhaar Last 4 Digits Only (never full number)'}
            />
          </div>
        )}
      </BlockCard>

      {/* B3 */}
      <BlockCard badge="B3" title={lbl('B3')} required missing={missingHead || missingHeadStatus}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          <div className="sm:col-span-2">
            <label className="block text-[12px] font-semibold text-[#726C5D] mb-1">
              {hi ? 'परिवार के मुखिया का नाम (Name of Household Head) *' : 'Name of Household Head *'}
            </label>
            <input
              type="text"
              value={profile.headName}
              onChange={(e) => setField('headName', e.target.value)}
              placeholder={hi ? 'परिवार के मुखिया का पूरा नाम लिखें...' : 'Full name of household head'}
              className={`w-full h-11 rounded-[10px] border px-3 text-[14px] ${
                missingHead ? 'border-[#C93B32] bg-[#FFF5F5]' : 'border-[#E7E2D4]'
              }`}
            />
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-[#726C5D] mb-1">
              {hi ? 'आयु (वर्ष)' : 'Age (Years)'}
            </label>
            <input
              type="number"
              min={1}
              max={120}
              value={profile.headAge}
              onChange={(e) => setField('headAge', e.target.value === '' ? '' : Number(e.target.value))}
              placeholder={hi ? 'आयु' : 'Age'}
              className="w-full h-11 rounded-[10px] border border-[#E7E2D4] px-3 text-[14px]"
            />
          </div>
        </div>
        <div>
          <label className="block text-[12px] font-semibold text-[#726C5D] mb-1">
            {hi ? 'मुखिया का लिंग व वैवाहिक स्थिति' : 'Head Gender & Marital Status'}
          </label>
          <SelectDropdown
            options={PART1_OPTIONS.b3HeadStatus}
            value={profile.headStatusCode}
            onChange={(v) => setField('headStatusCode', v)}
            language={language}
            placeholder={hi ? '— मुखिया की स्थिति चुनें —' : '— Select Head Status —'}
            specifyValue={profile.headStatusOther || ''}
            specifyPlaceholder={hi ? 'मुखिया का विवरण लिखें...' : 'Specify Head gender / marital status details...'}
            onSpecifyChange={(v) => setField('headStatusOther', v)}
          />
        </div>
      </BlockCard>

      {/* B4 */}
      <BlockCard badge="B4" title={lbl('B4')} required missing={missingB4}>
        <div className="mb-3">
          <Stepper
            label={hi ? 'परिवार में कुल सदस्य' : 'Total Household Members'}
            value={profile.totalMembers}
            min={1}
            onChange={handleTotalMembersChange}
          />
        </div>

        <div className="bg-[#FAF8F2] rounded-[10px] px-3 py-2 border border-[#E7E2D4] mb-3">
          <div className="flex items-center justify-between text-[12px] font-bold text-[#726C5D] mb-1">
            <span>{hi ? 'लिंग विभाजन' : 'Gender Breakdown'}</span>
            <div className="flex items-center gap-2">
              <span className={genderSum === profile.totalMembers ? 'text-[#1D7A4C] font-semibold' : 'text-[#B45309]'}>
                Sum: {genderSum} / {profile.totalMembers}
              </span>
            </div>
          </div>
          <Stepper
            label={hi ? 'पुरुष (Male)' : 'Male'}
            value={profile.maleCount}
            min={0}
            max={profile.totalMembers}
            disabledPlus={genderSum >= profile.totalMembers}
            onChange={(v) => handleGenderChange('maleCount', v)}
          />
          <Stepper
            label={hi ? 'महिला (Female)' : 'Female'}
            value={profile.femaleCount}
            min={0}
            max={profile.totalMembers}
            disabledPlus={genderSum >= profile.totalMembers}
            onChange={(v) => handleGenderChange('femaleCount', v)}
          />
          <Stepper
            label={hi ? 'अन्य (Other)' : 'Other'}
            value={profile.otherGenderCount}
            min={0}
            max={profile.totalMembers}
            disabledPlus={genderSum >= profile.totalMembers}
            onChange={(v) => handleGenderChange('otherGenderCount', v)}
          />
          {genderSum !== profile.totalMembers && (
            <p className="mt-2 text-[11.5px] font-medium text-[#C93B32]">
              {hi
                ? 'लिंग विभाजन कुल परिवार के सदस्यों के बराबर होना चाहिए।'
                : 'Gender breakdown must equal the total household members.'}
            </p>
          )}
        </div>

        <div className="bg-[#FAF8F2] rounded-[10px] px-3 py-2 border border-[#E7E2D4]">
          <div className="flex items-center justify-between text-[12px] font-bold text-[#726C5D] mb-1">
            <span>{hi ? 'आयु समूह (6 समूह)' : 'Age Group Breakdown (6 Brackets)'}</span>
            <div className="flex items-center gap-2">
              <span className={ageSum === profile.totalMembers ? 'text-[#1D7A4C] font-semibold' : 'text-[#B45309]'}>
                Sum: {ageSum} / {profile.totalMembers}
              </span>
            </div>
          </div>
          <Stepper
            label={hi ? '1 वर्ष से कम (0–11 माह)' : 'Under 1 year (0–11 months)'}
            value={ageUnder1}
            min={0}
            max={profile.totalMembers}
            disabledPlus={ageSum >= profile.totalMembers}
            onChange={(v) => handleAgeChange('ageUnder1', v)}
          />
          <Stepper
            label={hi ? '1 से 5 वर्ष' : '1–5 years'}
            value={age1to5}
            min={0}
            max={profile.totalMembers}
            disabledPlus={ageSum >= profile.totalMembers}
            onChange={(v) => handleAgeChange('age1to5', v)}
          />
          <Stepper
            label={hi ? '6 से 14 वर्ष' : '6–14 years'}
            value={profile.age6to14}
            min={0}
            max={profile.totalMembers}
            disabledPlus={ageSum >= profile.totalMembers}
            onChange={(v) => handleAgeChange('age6to14', v)}
          />
          <Stepper
            label={hi ? '15 से 17 वर्ष' : '15–17 years'}
            value={profile.age15to17}
            min={0}
            max={profile.totalMembers}
            disabledPlus={ageSum >= profile.totalMembers}
            onChange={(v) => handleAgeChange('age15to17', v)}
          />
          <Stepper
            label={hi ? '18 से 59 वर्ष' : '18–59 years'}
            value={profile.age18to59}
            min={0}
            max={profile.totalMembers}
            disabledPlus={ageSum >= profile.totalMembers}
            onChange={(v) => handleAgeChange('age18to59', v)}
          />
          <Stepper
            label={hi ? '60+ वर्ष' : '60+ years'}
            value={profile.age60Plus}
            min={0}
            max={profile.totalMembers}
            disabledPlus={ageSum >= profile.totalMembers}
            onChange={(v) => handleAgeChange('age60Plus', v)}
          />
          {ageSum !== profile.totalMembers && (
            <p className="mt-2 text-[11.5px] font-medium text-[#C93B32]">
              {hi
                ? 'आयु समूह विभाजन कुल परिवार के सदस्यों के बराबर होना चाहिए।'
                : 'Age group breakdown must equal the total household members.'}
            </p>
          )}
        </div>
      </BlockCard>

      {/* B5 */}
      <BlockCard badge="B5" title={lbl('B5')}>
        <div className="space-y-1.5">
          {PART1_OPTIONS.b5Vulnerable.map((o) => {
            const selected = (profile.vulnerableCodes ?? []).includes(o.code);
            return (
              <button
                key={o.code}
                type="button"
                onClick={() => toggleVulnerable(o.code)}
                className={`w-full text-left px-3 py-2.5 rounded-[10px] border flex items-center gap-2.5 min-h-[44px] text-[13.5px] ${
                  selected
                    ? 'bg-[#FFF5C4] border-[#D9AE00] font-semibold text-[#181611]'
                    : 'bg-white border-[#E7E2D4] text-[#181611] hover:bg-[#FAF8F2]'
                }`}
              >
                <span
                  className={`w-6 h-6 rounded-md shrink-0 flex items-center justify-center text-[11px] font-bold border ${
                    selected ? 'bg-[#FDC513] border-[#D9AE00] text-[#181611]' : 'bg-[#FAF8F2] border-[#D7D1C2] text-[#726C5D]'
                  }`}
                >
                  {selected ? <Check className="w-3.5 h-3.5" /> : o.code}
                </span>
                <span className="flex-1">{hi ? o.hi : o.en}</span>
              </button>
            );
          })}
        </div>

        {(profile.vulnerableCodes ?? []).some((c) => c === '6' || c === '7') && (
          <div className="mt-2.5">
            <label className="block text-[12px] font-semibold text-[#726C5D] mb-1">
              {hi ? 'अन्य संवेदनशील स्थिति का विवरण लिखें' : 'Specify Other Vulnerability Details'}
            </label>
            <input
              type="text"
              value={profile.vulnerableOther || ''}
              onChange={(e) => setField('vulnerableOther', e.target.value)}
              placeholder={hi ? 'विवरण लिखें...' : 'Specify Other Vulnerability details...'}
              className="w-full h-11 rounded-[10px] border border-[#E7E2D4] px-3 text-[14px]"
            />
          </div>
        )}
      </BlockCard>

      {/* B6 */}
      <BlockCard badge="B6" title={lbl('B6')}>
        <SelectDropdown
          options={PART1_OPTIONS.b6Religion}
          value={profile.religionCode}
          onChange={(v) => setField('religionCode', v)}
          language={language}
          placeholder={hi ? '— धर्म चुनें —' : '— Select Religion —'}
          specifyValue={profile.religionOther || ''}
          specifyPlaceholder={hi ? 'अन्य धर्म लिखें...' : 'Specify Religion...'}
          onSpecifyChange={(v) => setField('religionOther', v)}
        />
      </BlockCard>

      {/* B7 */}
      <BlockCard badge="B7" title={lbl('B7')}>
        <label className="block text-[12px] font-semibold text-[#726C5D] mb-1">
          {hi ? 'जाति / समुदाय / जनजाति का नाम लिखें' : 'Caste / Community / Tribe Name'}
        </label>
        <input
          type="text"
          value={profile.casteName}
          onChange={(e) => setField('casteName', e.target.value)}
          placeholder={hi ? 'जैसे: मिया / चरिया, बोडो, राभा...' : 'e.g., Miya, Bodo, Rabha, Koch-Rajbongshi...'}
          className="w-full h-11 rounded-[10px] border border-[#E7E2D4] px-3 text-[14px] mb-2"
        />
        <div className="flex flex-wrap gap-1.5 mb-3">
          {PART1_OPTIONS.b7Suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setField('casteName', s)}
              className="px-2.5 py-1 rounded-full bg-[#FAF8F2] border border-[#E7E2D4] text-[11.5px] font-medium text-[#726C5D] hover:bg-[#FFF5C4]"
            >
              {s}
            </button>
          ))}
        </div>
        <label className="block text-[12px] font-semibold text-[#726C5D] mb-1">
          {hi ? 'सरकारी श्रेणी' : 'Official Government Category'}
        </label>
        <SelectDropdown
          options={PART1_OPTIONS.b7CasteCategory}
          value={profile.casteCategoryCode}
          onChange={(v) => {
            setField('casteCategoryCode', v);
            if (v !== '6') setField('casteCategoryOther', '');
          }}
          language={language}
          placeholder={hi ? '— सरकारी श्रेणी चुनें —' : '— Select Government Category —'}
          specifyValue={profile.casteCategoryOther || ''}
          specifyPlaceholder={hi ? 'अन्य सरकारी श्रेणी लिखें...' : 'Specify Other Government Category...'}
          onSpecifyChange={(v) => setField('casteCategoryOther', v)}
        />
      </BlockCard>

      {/* B8 */}
      <BlockCard badge="B8" title={lbl('B8')}>
        <p className="text-[12px] text-[#726C5D] mb-2">
          {hi ? 'घर पर बोली जाने वाली भाषाएं चुनें (सभी लागू चुनें):' : 'Select Languages Spoken at Home (Select all that apply):'}
        </p>
        <div className="space-y-1.5">
          {PART1_OPTIONS.b8Language.map((o) => {
            const current = profile.primaryLanguageCodes && profile.primaryLanguageCodes.length > 0
              ? profile.primaryLanguageCodes
              : (profile.primaryLanguageCode ? profile.primaryLanguageCode.split(',').filter(Boolean) : []);
            const selected = current.includes(o.code);
            return (
              <button
                key={o.code}
                type="button"
                onClick={() => toggleLanguage(o.code)}
                className={`w-full text-left px-3 py-2.5 rounded-[10px] border flex items-center gap-2.5 min-h-[44px] text-[13.5px] ${
                  selected
                    ? 'bg-[#FFF5C4] border-[#D9AE00] font-semibold text-[#181611]'
                    : 'bg-white border-[#E7E2D4] text-[#181611] hover:bg-[#FAF8F2]'
                }`}
              >
                <span
                  className={`w-6 h-6 rounded-md shrink-0 flex items-center justify-center text-[11px] font-bold border ${
                    selected ? 'bg-[#FDC513] border-[#D9AE00] text-[#181611]' : 'bg-[#FAF8F2] border-[#D7D1C2] text-[#726C5D]'
                  }`}
                >
                  {selected ? <Check className="w-3.5 h-3.5" /> : o.code}
                </span>
                <span className="flex-1">{hi ? o.hi : o.en}</span>
              </button>
            );
          })}
        </div>

        {(profile.primaryLanguageCodes ?? (profile.primaryLanguageCode ? profile.primaryLanguageCode.split(',') : [])).includes('5') && (
          <div className="mt-2.5">
            <label className="block text-[12px] font-semibold text-[#726C5D] mb-1">
              {hi ? 'अन्य भाषा का नाम लिखें' : 'Specify Other Language'}
            </label>
            <input
              type="text"
              value={profile.primaryLanguageOther || ''}
              onChange={(e) => setField('primaryLanguageOther', e.target.value)}
              placeholder={hi ? 'भाषा का नाम लिखें...' : 'Specify Other Language name...'}
              className="w-full h-11 rounded-[10px] border border-[#E7E2D4] px-3 text-[14px]"
            />
          </div>
        )}
      </BlockCard>

      {/* B9 */}
      <BlockCard badge="B9" title={lbl('B9')} required missing={missingIncome}>
        <p className="text-[12px] text-[#726C5D] mb-2">
          {hi ? 'वर्तमान मासिक कुल आय (बेदखली के बाद):' : 'Current Monthly Household Income (Post-Eviction):'}
        </p>
        <SelectDropdown
          options={PART1_OPTIONS.b9Income}
          value={profile.incomeNowCode}
          onChange={(v) => setField('incomeNowCode', v)}
          language={language}
          placeholder={hi ? '— मासिक आय चुनें —' : '— Select Monthly Income —'}
        />
        <div className="mt-3">
          <label className="block text-[12px] font-semibold text-[#726C5D] mb-1">
            {hi ? 'बेदखली से पहले मासिक आय (अनुमानित ₹ या वर्ग)' : 'Pre-Eviction Monthly Income (Approx ₹ or category)'}
          </label>
          <input
            type="text"
            value={profile.incomeBeforeApprox}
            onChange={(e) => setField('incomeBeforeApprox', e.target.value)}
            placeholder={hi ? 'जैसे: ₹8,000 / माह' : 'e.g., Rs. 8,000 / month'}
            className="w-full h-11 rounded-[10px] border border-[#E7E2D4] px-3 text-[14px]"
          />
        </div>
      </BlockCard>

      {/* B10 */}
      <BlockCard badge="B10" title={lbl('B10')} required missing={missingLand}>
        <p className="text-[12px] text-[#726C5D] mb-2">
          {hi ? 'B10a. क्या परिवार के पास कोई ज़मीन है (या थी)?' : 'B10a. Does your family own any land?'}
        </p>
        <RadioGroup
          options={PART1_OPTIONS.b10LandOwned}
          value={profile.landOwnedCode || ''}
          onChange={(v) => {
            setField('landOwnedCode', v);
            if (v !== '1') {
              setField('landBighas', '');
              setField('landSizeCode', '');
              setField('landDocTypeCode', '');
              setField('landDocOther', '');
            }
          }}
          language={language}
        />

        {profile.landOwnedCode === '1' && (
          <div className="mt-4 pt-3 border-t border-[#F2EFE7] space-y-3">
            <div>
              <label className="block text-[12px] font-semibold text-[#726C5D] mb-1">
                {hi ? 'B10b. कुल भूमि (बीघा में लिखें व श्रेणी चुनें)' : 'B10b. Total Land Owned (Exact Bighas + Bracket)'}
              </label>
              <input
                type="text"
                value={profile.landBighas || ''}
                onChange={(e) => setField('landBighas', e.target.value)}
                placeholder={hi ? 'जैसे: 2.5 बीघा या 3 कट्ठा' : 'e.g., 2.5 Bighas or 3 Katha'}
                className="w-full h-11 rounded-[10px] border border-[#E7E2D4] px-3 text-[14px] mb-2"
              />
              <SelectDropdown
                options={PART1_OPTIONS.b10LandSize}
                value={profile.landSizeCode || ''}
                onChange={(v) => setField('landSizeCode', v)}
                language={language}
                placeholder={hi ? '— ज़मीन का आकार चुनें —' : '— Select Land Size —'}
              />
            </div>

            <div>
              <label className="block text-[12px] font-semibold text-[#726C5D] mb-1">
                {hi ? 'B10c. भूमि अधिकार / पट्टा का प्रकार' : 'B10c. Land Tenure / Document Type'}
              </label>
              <SelectDropdown
                options={PART1_OPTIONS.b10LandDocType}
                value={profile.landDocTypeCode || ''}
                onChange={(v) => setField('landDocTypeCode', v)}
                language={language}
                placeholder={hi ? '— दस्तावेज़ / पट्टा प्रकार चुनें —' : '— Select Tenure / Document Type —'}
                specifyValue={profile.landDocOther || ''}
                specifyPlaceholder={hi ? 'अन्य भूमि दस्तावेज़ का नाम लिखें...' : 'Specify Other Land / Tenure document details...'}
                onSpecifyChange={(v) => setField('landDocOther', v)}
              />
            </div>
          </div>
        )}
      </BlockCard>
    </div>
  );
};
