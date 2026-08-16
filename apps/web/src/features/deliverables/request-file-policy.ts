import {
  standardImageUploadMimeTypes,
  standardPresentationUploadMimeTypes,
  standardSupportingFileUploadMimeTypes,
  standardUploadMaximumBytes,
} from "@eventloom/contracts";
import type { DeliverableAssetKind } from "./api";

export interface RequestFileFormat {
  readonly id: string;
  readonly label: string;
  readonly mimeTypes: readonly string[];
}

export interface RequestFilePolicy {
  readonly kind: DeliverableAssetKind;
  readonly label: string;
  readonly description: string;
  readonly maxBytes: number;
  readonly formats: readonly RequestFileFormat[];
}

const requestFilePolicies = {
  headshot: {
    kind: "headshot",
    label: "Headshot",
    description: "One profile photo for the speaker.",
    maxBytes: standardUploadMaximumBytes.headshot,
    formats: [
      { id: "jpg", label: "JPG", mimeTypes: ["image/jpeg"] },
      { id: "png", label: "PNG", mimeTypes: ["image/png"] },
      { id: "webp", label: "WebP", mimeTypes: ["image/webp"] },
    ],
  },
  slides: {
    kind: "slides",
    label: "Slides",
    description: "A presentation deck for an accepted session.",
    maxBytes: standardUploadMaximumBytes.slides,
    formats: [
      { id: "pdf", label: "PDF", mimeTypes: ["application/pdf"] },
      {
        id: "powerpoint",
        label: "PowerPoint",
        mimeTypes: [
          "application/vnd.ms-powerpoint",
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        ],
      },
    ],
  },
  supporting_file: {
    kind: "supporting_file",
    label: "Supporting file",
    description: "Handouts, documents, or images related to the session.",
    maxBytes: standardUploadMaximumBytes.supporting_file,
    formats: [
      { id: "pdf", label: "PDF", mimeTypes: ["application/pdf"] },
      {
        id: "word",
        label: "Word",
        mimeTypes: [
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ],
      },
      { id: "plain-text", label: "Plain text", mimeTypes: ["text/plain"] },
      { id: "jpg", label: "JPG", mimeTypes: ["image/jpeg"] },
      { id: "png", label: "PNG", mimeTypes: ["image/png"] },
      { id: "webp", label: "WebP", mimeTypes: ["image/webp"] },
    ],
  },
} as const satisfies Record<DeliverableAssetKind, RequestFilePolicy>;

function assertMatchesPlatformPolicy(
  policy: RequestFilePolicy,
  expectedMimeTypes: readonly string[],
): RequestFilePolicy {
  const actualMimeTypes = policy.formats.flatMap((format) => format.mimeTypes);
  if (
    actualMimeTypes.length !== expectedMimeTypes.length ||
    actualMimeTypes.some((mimeType, index) => mimeType !== expectedMimeTypes[index])
  ) {
    throw new Error(`Request file policy for ${policy.kind} does not match the platform policy.`);
  }
  return policy;
}

export function requestFilePolicyFor(kind: DeliverableAssetKind): RequestFilePolicy {
  const policy = requestFilePolicies[kind];
  const expectedMimeTypes =
    kind === "headshot"
      ? standardImageUploadMimeTypes
      : kind === "slides"
        ? standardPresentationUploadMimeTypes
        : standardSupportingFileUploadMimeTypes;
  return assertMatchesPlatformPolicy(policy, expectedMimeTypes);
}

export function requestFilePolicyMimeTypes(policy: RequestFilePolicy): readonly string[] {
  return policy.formats.flatMap((format) => format.mimeTypes);
}
