export interface PublishedEvent {
  slug: string;
  name: string;
  timeZone: string;
  startsOn: string;
  endsOn: string;
  venueName: string | null;
}

export interface PublishedSpeaker {
  id: string;
  displayName: string;
  pronouns: string | null;
  jobTitle: string | null;
  organization: string | null;
  biography: string;
  photoUrl: string | null;
  sessionIds: readonly string[];
  sessionTitles: readonly string[];
  trackNames: readonly string[];
}

export interface PublishedAgendaEntry {
  id: string;
  sessionId?: string;
  title: string;
  summary: string;
  format: string;
  speakerNames: readonly string[];
  roomName: string;
  trackNames: readonly string[];
  startsAt: string;
  endsAt: string;
}

export interface PublishedSpeakerGallery {
  event: PublishedEvent;
  revision: {
    id: string;
    number: number;
    publishedAt: string;
  };
  speakers: readonly PublishedSpeaker[];
}

export interface PublishedAgenda {
  event: PublishedEvent;
  revision: {
    id: string;
    number: number;
    publishedAt: string;
  };
  entries: readonly PublishedAgendaEntry[];
}

export interface PublishedProgram {
  agenda: PublishedAgenda;
  speakers: PublishedSpeakerGallery;
}

export interface PublicEmbedErrorResponse {
  error?: {
    code?: string;
    message?: string;
    traceId?: string;
  };
}

export type EmbedTheme = "auto" | "dark" | "light";
