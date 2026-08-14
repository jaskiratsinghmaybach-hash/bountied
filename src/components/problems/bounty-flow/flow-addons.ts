export type AddonDef = { id: string; label: string; enabled: boolean };
export const ADDON_MATRIX: Record<string, AddonDef[]> = {
  python: ["Django", "FastAPI", "Flask", "SQLAlchemy", "Pandas", "NumPy", "PyTorch", "TensorFlow", "scikit-learn", "Celery", "pytest", "PostgreSQL", "Redis", "Docker"].map(a => ({ id: a.toLowerCase().replace(/[^a-z0-9]/g, '_'), label: a, enabled: true })),
  javascript: ["Express", "Fastify", "React", "Vue", "jQuery", "PostgreSQL", "MongoDB", "Redis", "Jest", "Docker"].map(a => ({ id: a.toLowerCase().replace(/[^a-z0-9]/g, '_'), label: a, enabled: true })),
  typescript: ["Next.js", "NestJS", "Prisma", "tRPC", "React", "Vue", "Zod", "PostgreSQL", "Docker"].map(a => ({ id: a.toLowerCase().replace(/[^a-z0-9]/g, '_'), label: a, enabled: true })),
  react: ["Next.js", "Redux", "Zustand", "TanStack Query", "Tailwind CSS", "shadcn/ui", "Vite"].map(a => ({ id: a.toLowerCase().replace(/[^a-z0-9]/g, '_'), label: a, enabled: true })),
  nextjs: ["React", "Prisma", "Tailwind CSS", "Vercel AI SDK", "tRPC", "Supabase"].map(a => ({ id: a.toLowerCase().replace(/[^a-z0-9]/g, '_'), label: a, enabled: true })),
  nodejs: ["Express", "Fastify", "NestJS", "PostgreSQL", "MongoDB", "Redis", "Docker", "GraphQL"].map(a => ({ id: a.toLowerCase().replace(/[^a-z0-9]/g, '_'), label: a, enabled: true })),
  php: ["Laravel", "Symfony", "WordPress", "MySQL", "Composer"].map(a => ({ id: a.toLowerCase().replace(/[^a-z0-9]/g, '_'), label: a, enabled: true })),
  go: ["Gin", "Echo", "gRPC", "PostgreSQL", "Docker", "Kubernetes"].map(a => ({ id: a.toLowerCase().replace(/[^a-z0-9]/g, '_'), label: a, enabled: true })),
  rust: ["Actix", "Axum", "Tokio", "WebAssembly", "Cargo"].map(a => ({ id: a.toLowerCase().replace(/[^a-z0-9]/g, '_'), label: a, enabled: true })),
  java: ["Spring Boot", "Hibernate", "Maven", "Gradle", "Kafka", "PostgreSQL"].map(a => ({ id: a.toLowerCase().replace(/[^a-z0-9]/g, '_'), label: a, enabled: true })),
  csharp: ["ASP.NET Core", "Entity Framework", "Blazor", ".NET MAUI", "SQL Server"].map(a => ({ id: a.toLowerCase().replace(/[^a-z0-9]/g, '_'), label: a, enabled: true })),
  cpp: ["Qt", "Boost", "CMake", "OpenGL", "CUDA"].map(a => ({ id: a.toLowerCase().replace(/[^a-z0-9]/g, '_'), label: a, enabled: true })),
  c: ["POSIX", "Embedded/Firmware toolchains", "Make", "CMake"].map(a => ({ id: a.toLowerCase().replace(/[^a-z0-9]/g, '_'), label: a, enabled: true })),
  swift: ["SwiftUI", "UIKit", "Combine", "CoreData", "Vapor", "Xcode"].map(a => ({ id: a.toLowerCase().replace(/[^a-z0-9]/g, '_'), label: a, enabled: true })),
  kotlin: ["Jetpack Compose", "Ktor", "Android SDK", "Coroutines"].map(a => ({ id: a.toLowerCase().replace(/[^a-z0-9]/g, '_'), label: a, enabled: true })),
  dart: ["Flutter", "Firebase", "Riverpod", "Bloc"].map(a => ({ id: a.toLowerCase().replace(/[^a-z0-9]/g, '_'), label: a, enabled: true })),
  reactnative: ["Expo", "React Navigation", "Redux", "Firebase"].map(a => ({ id: a.toLowerCase().replace(/[^a-z0-9]/g, '_'), label: a, enabled: true })),
  sql: ["PostgreSQL", "MySQL", "SQLite", "SQL Server", "BigQuery", "Snowflake"].map(a => ({ id: a.toLowerCase().replace(/[^a-z0-9]/g, '_'), label: a, enabled: true })),
  ruby: ["Ruby on Rails", "RSpec", "Sidekiq", "PostgreSQL"].map(a => ({ id: a.toLowerCase().replace(/[^a-z0-9]/g, '_'), label: a, enabled: true })),
  bash: ["Linux/Unix", "Docker", "CI/CD scripting", "Cron"].map(a => ({ id: a.toLowerCase().replace(/[^a-z0-9]/g, '_'), label: a, enabled: true })),
  solidity: ["Hardhat", "Foundry", "OpenZeppelin", "Ethers.js", "Web3.js"].map(a => ({ id: a.toLowerCase().replace(/[^a-z0-9]/g, '_'), label: a, enabled: true })),
  r: ["tidyverse", "ggplot2", "Shiny", "RStudio"].map(a => ({ id: a.toLowerCase().replace(/[^a-z0-9]/g, '_'), label: a, enabled: true })),
  scala: ["Akka", "Play Framework", "Spark", "sbt"].map(a => ({ id: a.toLowerCase().replace(/[^a-z0-9]/g, '_'), label: a, enabled: true })),
  elixir: ["Phoenix", "Ecto", "OTP/GenServer"].map(a => ({ id: a.toLowerCase().replace(/[^a-z0-9]/g, '_'), label: a, enabled: true })),
  matlab: ["Simulink", "Signal Processing Toolbox", "Deep Learning Toolbox"].map(a => ({ id: a.toLowerCase().replace(/[^a-z0-9]/g, '_'), label: a, enabled: true }))
};
export function getAddonsForLanguage(languageId: string): AddonDef[] {
  return ADDON_MATRIX[languageId] ?? [];
}
