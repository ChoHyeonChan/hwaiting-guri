import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // 손으로 돌려 보는 임시 확인 스크립트. 커밋하지 않으며 배포에도 들어가지 않는다.
    // 외부 라이브러리 응답을 그때그때 들여다보는 용도라 타입을 느슨하게 둔다.
    "scripts/*-tmp.ts",
  ]),
]);

export default eslintConfig;
