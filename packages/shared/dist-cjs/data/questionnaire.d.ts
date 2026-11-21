import { DocumentCategoryConfig, HouseholdProfile, QuestionDef } from '../types/survey';
export declare const STUDY_META: {
    organization: string;
    organizationLocation: string;
    appName: string;
    studyTitle: string;
    researchers: string;
    supervisor: string;
    targetSample: number;
    version: number;
};
export declare const CONSENT_PROTOCOL: {
    titleEn: string;
    titleHi: string;
    en: string;
    hi: string;
    oralConsentLabelEn: string;
    oralConsentLabelHi: string;
    docPhotoConsentLabelEn: string;
    docPhotoConsentLabelHi: string;
};
export declare const PART1_OPTIONS: {
    interviewers: string[];
    b1Districts: ({
        key: string;
        code: string;
        id: string;
        en: string;
        hi: string;
        specifyText?: undefined;
    } | {
        key: string;
        code: string;
        id: string;
        en: string;
        hi: string;
        specifyText: boolean;
    })[];
    b2DocVerified: ({
        key: string;
        code: string;
        en: string;
        hi: string;
        specifyText?: undefined;
    } | {
        key: string;
        code: string;
        en: string;
        hi: string;
        specifyText: boolean;
    })[];
    b3HeadStatus: ({
        key: string;
        code: string;
        en: string;
        hi: string;
        specifyText?: undefined;
    } | {
        key: string;
        code: string;
        en: string;
        hi: string;
        specifyText: boolean;
    })[];
    b5Vulnerable: ({
        key: string;
        code: string;
        en: string;
        hi: string;
        specifyText?: undefined;
    } | {
        key: string;
        code: string;
        en: string;
        hi: string;
        specifyText: boolean;
    })[];
    b6Religion: ({
        key: string;
        code: string;
        en: string;
        hi: string;
        specifyText?: undefined;
    } | {
        key: string;
        code: string;
        en: string;
        hi: string;
        specifyText: boolean;
    })[];
    b7Suggestions: string[];
    b7CasteCategory: ({
        key: string;
        code: string;
        en: string;
        hi: string;
        specifyText?: undefined;
    } | {
        key: string;
        code: string;
        en: string;
        hi: string;
        specifyText: boolean;
    })[];
    b8Language: ({
        key: string;
        code: string;
        en: string;
        hi: string;
        specifyText?: undefined;
    } | {
        key: string;
        code: string;
        en: string;
        hi: string;
        specifyText: boolean;
    })[];
    b9Income: {
        key: string;
        code: string;
        en: string;
        hi: string;
    }[];
    b10LandOwned: {
        key: string;
        code: string;
        en: string;
        hi: string;
    }[];
    b10LandSize: {
        key: string;
        code: string;
        en: string;
        hi: string;
    }[];
    b10LandDocType: ({
        key: string;
        code: string;
        en: string;
        hi: string;
        specifyText?: undefined;
    } | {
        key: string;
        code: string;
        en: string;
        hi: string;
        specifyText: boolean;
    })[];
};
export declare const PART1_LABELS: {
    B1: {
        en: string;
        hi: string;
    };
    B2: {
        en: string;
        hi: string;
    };
    B3: {
        en: string;
        hi: string;
    };
    B4: {
        en: string;
        hi: string;
    };
    B5: {
        en: string;
        hi: string;
    };
    B6: {
        en: string;
        hi: string;
    };
    B7: {
        en: string;
        hi: string;
    };
    B8: {
        en: string;
        hi: string;
    };
    B9: {
        en: string;
        hi: string;
    };
    B10: {
        en: string;
        hi: string;
    };
};
export declare const SURVEY_SECTIONS: readonly [{
    readonly id: "A";
    readonly titleEn: "Settlement History, Eviction Proof & Notice";
    readonly titleHi: "बसावट इतिहास, बेदखली प्रमाण और नोटिस";
    readonly range: "Q1–Q5";
}, {
    readonly id: "B";
    readonly titleEn: "Adult Literacy, Schooling & Anganwadi";
    readonly titleHi: "साक्षरता, बच्चों की शिक्षा और आंगनवाड़ी";
    readonly range: "Q6–Q8";
}, {
    readonly id: "C";
    readonly titleEn: "Health, Maternal Care & Household Hunger";
    readonly titleHi: "स्वास्थ्य, मातृ देखभाल और भोजन/भूख स्थिति";
    readonly range: "Q9–Q12";
}, {
    readonly id: "D";
    readonly titleEn: "Shelter, WASH, Privacy & Assets/Debt";
    readonly titleHi: "आवास, पानी/शौचालय, सुरक्षा और संपत्ति/कर्ज";
    readonly range: "Q13–Q20";
}, {
    readonly id: "E";
    readonly titleEn: "Livelihoods, Economic Loss & Welfare Schemes";
    readonly titleHi: "आजीविका, आर्थिक नुकसान, दस्तावेज़ और योजनाएँ";
    readonly range: "Q21–Q25";
}, {
    readonly id: "F";
    readonly titleEn: "Lived Experience, Daily Struggles & Resilience";
    readonly titleHi: "बेदखली की आपबीती, तकलीफें और हौसला";
    readonly range: "Q26–Q28";
}];
export declare const QUESTIONS: QuestionDef[];
export declare const DEFAULT_DOCUMENT_CATEGORIES: DocumentCategoryConfig[];
export declare function createEmptyProfile(surveyCode?: string, interviewer?: string): HouseholdProfile;
