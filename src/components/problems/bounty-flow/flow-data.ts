export type LanguageSection = "web" | "systems" | "mobile" | "data";

export type LanguageDef = {
  id: string;
  label: string;
  section: LanguageSection;
  enabled: boolean;
};

/** Display order within each cosmetic section (§3). */
export const LANGUAGE_DEFS: LanguageDef[] = [
  // Web & Full-Stack
  { id: "javascript", label: "JavaScript", section: "web", enabled: false },
  { id: "typescript", label: "TypeScript", section: "web", enabled: false },
  { id: "react", label: "React", section: "web", enabled: false },
  { id: "nextjs", label: "Next.js", section: "web", enabled: false },
  { id: "nodejs", label: "Node.js", section: "web", enabled: false },
  { id: "php", label: "PHP", section: "web", enabled: false },
  // Systems & Backend
  { id: "python", label: "Python", section: "systems", enabled: true },
  { id: "go", label: "Go", section: "systems", enabled: false },
  { id: "rust", label: "Rust", section: "systems", enabled: false },
  { id: "java", label: "Java", section: "systems", enabled: false },
  { id: "csharp", label: "C#", section: "systems", enabled: false },
  { id: "cpp", label: "C++", section: "systems", enabled: false },
  { id: "c", label: "C", section: "systems", enabled: false },
  // Mobile & Cross-Platform
  { id: "swift", label: "Swift", section: "mobile", enabled: false },
  { id: "kotlin", label: "Kotlin", section: "mobile", enabled: false },
  { id: "dart", label: "Dart/Flutter", section: "mobile", enabled: false },
  { id: "reactnative", label: "React Native", section: "mobile", enabled: false },
  // Data, Scripting & Other
  { id: "sql", label: "SQL", section: "data", enabled: false },
  { id: "ruby", label: "Ruby", section: "data", enabled: false },
  { id: "bash", label: "Bash/Shell", section: "data", enabled: false },
  { id: "solidity", label: "Solidity", section: "data", enabled: false },
  { id: "r", label: "R", section: "data", enabled: false },
  { id: "scala", label: "Scala", section: "data", enabled: false },
  { id: "elixir", label: "Elixir", section: "data", enabled: false },
  { id: "matlab", label: "MATLAB", section: "data", enabled: false },
];

export const LANGUAGE_SECTIONS: {
  id: LanguageSection;
  title: string;
}[] = [
  { id: "web", title: "Web & Full-Stack" },
  { id: "systems", title: "Systems & Backend" },
  { id: "mobile", title: "Mobile & Cross-Platform" },
  { id: "data", title: "Data, Scripting & Other" },
];

export function getLanguageDef(id: string): LanguageDef | undefined {
  return LANGUAGE_DEFS.find((lang) => lang.id === id);
}

export function getLanguagesBySection(section: LanguageSection): LanguageDef[] {
  return LANGUAGE_DEFS.filter((lang) => lang.section === section);
}

export function getLanguageLabel(id: string): string {
  return getLanguageDef(id)?.label ?? id;
}

export type ScopeDef = {
  id: string;
  label: string;
  enabled: boolean;
};

/** Appended by the UI — never stored in SCOPE_MATRIX (§4). */
export const CUSTOM_SCOPE_ID = "custom";

/**
 * Exactly 4 tailored scope pills per language id. Custom is rendered by
 * step-scope.tsx. `enabled` mirrors language reachability; gating at
 * render time uses isScopeSelectionEnabled(languageId).
 */
export const SCOPE_MATRIX: Record<string, ScopeDef[]> = {
  python: [
    { id: "data_analysis", label: "Data Analysis", enabled: true },
    { id: "ml_ai", label: "Machine Learning / AI", enabled: true },
    {
      id: "web_backend",
      label: "Web Backend (Django/FastAPI/Flask)",
      enabled: true,
    },
    { id: "automation_scripting", label: "Automation & Scripting", enabled: true },
  ],
  javascript: [
    { id: "frontend_dom", label: "Frontend / DOM", enabled: true },
    { id: "browser_extensions", label: "Browser Extensions", enabled: true },
    {
      id: "automation_tooling",
      label: "Automation & Tooling (build scripts, CLIs)",
      enabled: true,
    },
    { id: "node_backend", label: "Node Backend", enabled: true },
  ],
  typescript: [
    { id: "frontend_typed", label: "Frontend (typed)", enabled: true },
    {
      id: "fullstack_nextjs",
      label: "Full-Stack (Next.js-style)",
      enabled: true,
    },
    { id: "backend_api", label: "Backend API", enabled: true },
    {
      id: "type_tooling_infra",
      label: "Type/Tooling Infra (SDKs, type defs, linters)",
      enabled: true,
    },
  ],
  react: [
    {
      id: "ui_components_state",
      label: "UI Components & State Bugs",
      enabled: true,
    },
    {
      id: "performance",
      label: "Performance (re-renders, bundle size)",
      enabled: true,
    },
    { id: "forms_data_fetching", label: "Forms & Data Fetching", enabled: true },
    {
      id: "design_system",
      label: "Design System / Component Library",
      enabled: true,
    },
  ],
  nextjs: [
    { id: "ssr_routing", label: "SSR / Routing / App Router", enabled: true },
    {
      id: "api_routes_actions",
      label: "API Routes & Server Actions",
      enabled: true,
    },
    { id: "auth_middleware", label: "Auth & Middleware", enabled: true },
    {
      id: "deployment_build",
      label: "Deployment/Build Issues (Vercel-class)",
      enabled: true,
    },
  ],
  nodejs: [
    { id: "rest_graphql", label: "REST/GraphQL APIs", enabled: true },
    {
      id: "realtime",
      label: "Real-time (WebSockets, SSE)",
      enabled: true,
    },
    { id: "cli_tools", label: "CLI Tools & Scripts", enabled: true },
    { id: "background_jobs", label: "Background Jobs / Queues", enabled: true },
  ],
  php: [
    { id: "wordpress", label: "WordPress", enabled: true },
    { id: "laravel", label: "Laravel Apps", enabled: true },
    {
      id: "legacy_php",
      label: "Legacy/Vanilla PHP Maintenance",
      enabled: true,
    },
    {
      id: "ecommerce",
      label: "E-commerce (WooCommerce/Magento-class)",
      enabled: true,
    },
  ],
  go: [
    { id: "microservices_apis", label: "Microservices / APIs", enabled: true },
    { id: "cli_tools", label: "CLI Tools", enabled: true },
    {
      id: "concurrency",
      label: "Concurrency / Goroutine Bugs",
      enabled: true,
    },
    {
      id: "cloud_native",
      label: "Cloud-Native (Kubernetes/Docker tooling)",
      enabled: true,
    },
  ],
  rust: [
    {
      id: "systems_performance",
      label: "Systems / Performance-Critical",
      enabled: true,
    },
    { id: "wasm", label: "WebAssembly", enabled: true },
    { id: "cli_tools", label: "CLI Tools", enabled: true },
    { id: "blockchain_web3", label: "Blockchain / Web3 Infra", enabled: true },
  ],
  java: [
    {
      id: "enterprise_spring",
      label: "Enterprise Backend (Spring)",
      enabled: true,
    },
    { id: "android_legacy", label: "Android (legacy Java)", enabled: true },
    {
      id: "concurrency_threading",
      label: "Concurrency & Threading",
      enabled: true,
    },
    {
      id: "build_deps",
      label: "Build/Dependency Issues (Maven/Gradle)",
      enabled: true,
    },
  ],
  csharp: [
    { id: "aspnet_core", label: ".NET Web (ASP.NET Core)", enabled: true },
    {
      id: "desktop",
      label: "Desktop (WPF/WinForms/MAUI)",
      enabled: true,
    },
    { id: "unity", label: "Unity Game Dev", enabled: true },
    {
      id: "enterprise_azure",
      label: "Enterprise/Azure Integration",
      enabled: true,
    },
  ],
  cpp: [
    {
      id: "performance_systems",
      label: "Performance / Systems Programming",
      enabled: true,
    },
    { id: "game_dev", label: "Game Dev (engines)", enabled: true },
    { id: "embedded_firmware", label: "Embedded / Firmware", enabled: true },
    {
      id: "graphics",
      label: "Graphics (OpenGL/Vulkan/DirectX)",
      enabled: true,
    },
  ],
  c: [
    { id: "embedded_firmware", label: "Embedded / Firmware", enabled: true },
    { id: "os_kernel", label: "OS / Kernel-Level", enabled: true },
    {
      id: "memory_pointers",
      label: "Memory & Pointer Bugs",
      enabled: true,
    },
    {
      id: "legacy_maintenance",
      label: "Legacy System Maintenance",
      enabled: true,
    },
  ],
  swift: [
    { id: "ios_apps", label: "iOS Apps", enabled: true },
    { id: "macos_apps", label: "macOS Apps", enabled: true },
    { id: "server_vapor", label: "Server-Side (Vapor)", enabled: true },
    { id: "watchos_tvos", label: "watchOS/tvOS", enabled: true },
  ],
  kotlin: [
    { id: "android_apps", label: "Android Apps", enabled: true },
    { id: "jetpack_compose", label: "Jetpack Compose UI", enabled: true },
    { id: "backend_ktor", label: "Backend (Ktor/Spring)", enabled: true },
    { id: "multiplatform", label: "Multiplatform (KMP)", enabled: true },
  ],
  dart: [
    { id: "flutter_ui", label: "Flutter UI", enabled: true },
    {
      id: "state_management",
      label: "State Management (Bloc/Riverpod/Provider)",
      enabled: true,
    },
    {
      id: "platform_channels",
      label: "Platform Channels (native bridge)",
      enabled: true,
    },
    {
      id: "performance_animation",
      label: "Performance/Animation",
      enabled: true,
    },
  ],
  reactnative: [
    { id: "ui_navigation", label: "UI/Navigation", enabled: true },
    {
      id: "native_module_bridging",
      label: "Native Module Bridging",
      enabled: true,
    },
    {
      id: "performance",
      label: "Performance (bridge lag, list rendering)",
      enabled: true,
    },
    { id: "expo_build", label: "Expo/Build Config", enabled: true },
  ],
  sql: [
    {
      id: "query_performance",
      label: "Query Performance / Indexing",
      enabled: true,
    },
    { id: "schema_design", label: "Schema Design", enabled: true },
    { id: "data_migration", label: "Data Migration", enabled: true },
    {
      id: "reporting_analytics",
      label: "Reporting/Analytics Queries",
      enabled: true,
    },
  ],
  ruby: [
    { id: "rails_apps", label: "Ruby on Rails Apps", enabled: true },
    { id: "api_backend", label: "API/Backend", enabled: true },
    {
      id: "background_jobs",
      label: "Background Jobs (Sidekiq)",
      enabled: true,
    },
    {
      id: "legacy_rails",
      label: "Legacy Rails Maintenance",
      enabled: true,
    },
  ],
  bash: [
    {
      id: "shell_automation",
      label: "Shell Scripts & Automation",
      enabled: true,
    },
    {
      id: "cicd_scripts",
      label: "CI/CD Pipeline Scripts",
      enabled: true,
    },
    { id: "sysadmin", label: "System Administration", enabled: true },
    { id: "cron_ops", label: "Cron/Ops Tooling", enabled: true },
  ],
  solidity: [
    {
      id: "smart_contract_bugs",
      label: "Smart Contract Bugs",
      enabled: true,
    },
    { id: "gas_optimization", label: "Gas Optimization", enabled: true },
    {
      id: "security_audit",
      label: "Security Audit / Vulnerability Fix",
      enabled: true,
    },
    { id: "defi_logic", label: "DeFi Protocol Logic", enabled: true },
  ],
  r: [
    { id: "statistical_analysis", label: "Statistical Analysis", enabled: true },
    { id: "data_visualization", label: "Data Visualization", enabled: true },
    {
      id: "bioinformatics",
      label: "Bioinformatics / Scientific Computing",
      enabled: true,
    },
    { id: "shiny_dashboards", label: "Shiny Dashboards", enabled: true },
  ],
  scala: [
    {
      id: "spark_big_data",
      label: "Spark / Big Data Pipelines",
      enabled: true,
    },
    { id: "backend_akka_play", label: "Backend (Akka/Play)", enabled: true },
    {
      id: "fp_bugs",
      label: "Functional Programming Bugs",
      enabled: true,
    },
    { id: "concurrency", label: "Concurrency", enabled: true },
  ],
  elixir: [
    { id: "phoenix_web", label: "Phoenix Web Apps", enabled: true },
    {
      id: "realtime_channels",
      label: "Real-Time/Channels (chat, live features)",
      enabled: true,
    },
    {
      id: "otp_genserver",
      label: "OTP/GenServer & Fault Tolerance",
      enabled: true,
    },
    { id: "background_jobs", label: "Background Jobs", enabled: true },
  ],
  matlab: [
    { id: "signal_processing", label: "Signal Processing", enabled: true },
    {
      id: "numerical_computing",
      label: "Numerical/Scientific Computing",
      enabled: true,
    },
    { id: "simulink", label: "Simulink Modeling", enabled: true },
    { id: "data_visualization", label: "Data Visualization", enabled: true },
  ],
};

export function getScopesForLanguage(languageId: string): ScopeDef[] {
  return SCOPE_MATRIX[languageId] ?? [];
}

export function getScopeDef(
  languageId: string,
  scopeId: string
): ScopeDef | undefined {
  return getScopesForLanguage(languageId).find((scope) => scope.id === scopeId);
}

/** Scope pills are selectable only when the parent language is enabled (§6). */
export function isScopeSelectionEnabled(languageId: string | null): boolean {
  if (!languageId) return false;
  return getLanguageDef(languageId)?.enabled ?? false;
}
