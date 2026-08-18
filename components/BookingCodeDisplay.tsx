"use client";

import { useState } from "react";

interface BookingCodeDisplayProps {
  code: string;
  size?: "sm" | "md" | "lg";
  tone?: "accent" | "brand";
  className?: string;
}

function CopyIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

export function BookingCodeDisplay({
  code,
  size = "md",
  tone = "brand",
  className = "",
}: BookingCodeDisplayProps) {
  const [copied, setCopied] = useState(false);

  const textSize =
    size === "lg" ? "text-lg" : size === "sm" ? "text-sm" : "text-base";
  const color = tone === "brand" ? "text-brand" : "text-accent";
  const btnColor =
    tone === "brand"
      ? "bg-brand/10 text-brand hover:bg-brand/20"
      : "bg-accent/10 text-accent hover:bg-accent/20";
  const btnCopied = tone === "brand" ? "bg-brand text-white" : "bg-accent text-white";

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const input = document.createElement("textarea");
      input.value = code;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <span className={`font-mono font-bold tracking-widest ${color} ${textSize}`}>
        {code}
      </span>
      <button
        type="button"
        onClick={handleCopy}
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ${
          copied ? btnCopied : btnColor
        }`}
        aria-label={copied ? "Copied" : "Copy booking code"}
        title={copied ? "Copied!" : "Copy code"}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </button>
    </div>
  );
}
