import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Locale = "zh-CN" | "en-US";

const LOCALE_STORAGE_KEY = "corpusflow.locale";

const messages = {
  "zh-CN": {
    "language.switch": "切换语言",
    "language.zh": "中文",
    "language.en": "EN",
    "nav.home": "首页",
    "nav.fineTune": "精调生成",
    "nav.quick": "批量任务",
    "nav.evaluation": "评测增强",
    "nav.taskList": "任务列表",
    "auth.email": "邮箱",
    "auth.password": "密码",
    "auth.signIn": "登录 / 注册",
    "auth.signOut": "退出",
    "home.fineTune.title": "精调生成",
    "home.fineTune.description": "深度解析、仿写、扩写，支持极速与高质量模式",
    "home.quick.title": "批量任务",
    "home.quick.description": "弱编辑、重吞吐，面向大批量生成与筛选",
    "home.evaluation.title": "评测增强",
    "home.evaluation.description": "从 badcase 归因到修复数据资产包",
    "home.tasks.title": "任务列表",
    "home.tasks.all": "查看全部任务",
    "home.tasks.name": "任务名称",
    "home.tasks.type": "类型",
    "home.tasks.time": "时间",
    "home.tasks.actions": "操作",
    "task.badge.evaluation": "评测增强",
    "task.badge.quick": "批量任务",
    "task.badge.fineTune": "精调生成",
  },
  "en-US": {
    "language.switch": "Switch language",
    "language.zh": "中文",
    "language.en": "EN",
    "nav.home": "Home",
    "nav.fineTune": "Fine-tune",
    "nav.quick": "Batch tasks",
    "nav.evaluation": "Evaluation",
    "nav.taskList": "Tasks",
    "auth.email": "Email",
    "auth.password": "Password",
    "auth.signIn": "Sign in",
    "auth.signOut": "Sign out",
    "home.fineTune.title": "Fine-tune generation",
    "home.fineTune.description": "Analyze, paraphrase, and expand data with fast and high-quality modes.",
    "home.quick.title": "Batch tasks",
    "home.quick.description": "High-throughput generation and filtering for large datasets.",
    "home.evaluation.title": "Evaluation enhancement",
    "home.evaluation.description": "Turn bad cases into attributable remediation data packages.",
    "home.tasks.title": "Tasks",
    "home.tasks.all": "View all tasks",
    "home.tasks.name": "Task name",
    "home.tasks.type": "Type",
    "home.tasks.time": "Created",
    "home.tasks.actions": "Actions",
    "task.badge.evaluation": "Evaluation",
    "task.badge.quick": "Batch",
    "task.badge.fineTune": "Fine-tune",
  },
} as const;

export type TranslationKey = keyof typeof messages["zh-CN"];

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function resolveInitialLocale(): Locale {
  if (typeof window === "undefined") return "en-US";
  const storedLocale = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  if (storedLocale === "zh-CN" || storedLocale === "en-US") return storedLocale;
  return "en-US";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(resolveInitialLocale);

  useEffect(() => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<I18nContextValue>(() => ({
    locale,
    setLocale,
    t: (key) => messages[locale][key],
  }), [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside I18nProvider");
  return context;
}
