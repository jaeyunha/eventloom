"use client";

export type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
