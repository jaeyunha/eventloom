"use client";

import type { FormEvent } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { type MemberRole, memberRoles, type OrganizationMember } from "./api";
import styles from "./member-workspace.module.css";

type MemberFilter = "all" | MemberRole;
type MemberStatusFilter = "all" | "pending" | "active";

type OrganizationDraft = {
  readonly slug: string;
  readonly name: string;
  readonly config: string;
};

const MEMBER_UPDATED_AT_FORMATTER = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeZone: "UTC",
});

function statusLabel(value: string): string {
  return value.replace(/[_-]+/gu, " ").replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

function roleLabel(role: MemberRole): string {
  if (role === "reviewer") return "Evaluator";
  if (role === "admin") return "Organization admin";
  return "Organization owner";
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Date unavailable";
  return MEMBER_UPDATED_AT_FORMATTER.format(date);
}

function MemberRow({
  member,
  busy,
  onRoleChange,
  onRevoke,
}: Readonly<{
  readonly member: OrganizationMember;
  readonly busy: boolean;
  readonly onRoleChange: (member: OrganizationMember, role: MemberRole) => void;
  readonly onRevoke: (member: OrganizationMember) => void;
}>) {
  const ownerProtected = member.role === "owner";
  return (
    <TableRow>
      <TableHead scope="row" className={styles.memberCell}>
        <strong className={styles.memberName}>{member.name || "Unnamed member"}</strong>
        <span className={styles.memberMeta}>{member.email}</span>
        {!member.emailVerified ? <span className={styles.pendingText}>Setup pending</span> : null}
      </TableHead>
      <TableCell>
        <Badge variant="secondary">{roleLabel(member.role)}</Badge>
        {member.role === "reviewer" ? (
          <span className={styles.cellHint}>Review access only</span>
        ) : null}
      </TableCell>
      <TableCell>
        <Badge variant={member.status === "active" ? "default" : "outline"}>
          {statusLabel(member.status)}
        </Badge>
      </TableCell>
      <TableCell className={styles.dateCell}>{formatDate(member.updatedAt)}</TableCell>
      <TableCell>
        <div className={styles.rowActions}>
          <Select
            value={member.role}
            onValueChange={(value) => onRoleChange(member, value as MemberRole)}
            disabled={busy || ownerProtected}
          >
            <SelectTrigger
              className={styles.compactControl}
              aria-label={`Change role for ${member.email}`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {memberRoles.map((role) => (
                <SelectItem value={role} key={role}>
                  {roleLabel(role)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {ownerProtected ? (
            <span className={styles.cellHint}>Owner access is protected</span>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={() => onRevoke(member)}
            disabled={busy || ownerProtected}
          >
            {busy ? "Updating…" : "Revoke access"}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function MemberPeopleSection({
  members,
  filteredMembers,
  loading,
  workspaceError,
  query,
  roleFilter,
  statusFilter,
  busyUserId,
  onQueryChange,
  onRoleFilterChange,
  onStatusFilterChange,
  onInvite,
  onRoleChange,
  onRevoke,
}: Readonly<{
  readonly members: readonly OrganizationMember[];
  readonly filteredMembers: readonly OrganizationMember[];
  readonly loading: boolean;
  readonly workspaceError: string | null;
  readonly query: string;
  readonly roleFilter: MemberFilter;
  readonly statusFilter: MemberStatusFilter;
  readonly busyUserId: string | null;
  readonly onQueryChange: (value: string) => void;
  readonly onRoleFilterChange: (value: MemberFilter) => void;
  readonly onStatusFilterChange: (value: MemberStatusFilter) => void;
  readonly onInvite: () => void;
  readonly onRoleChange: (member: OrganizationMember, role: MemberRole) => void;
  readonly onRevoke: (member: OrganizationMember) => void;
}>) {
  return (
    <Card>
      <CardHeader className={styles.cardHeader}>
        <div>
          <CardTitle>People directory</CardTitle>
          <CardDescription>
            Search everyone in this organization and keep administrative access separate from review
            access.
          </CardDescription>
        </div>
        <CardAction>
          <Button type="button" onClick={onInvite}>
            Invite member
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className={styles.cardContent}>
        <div className={styles.filters}>
          <div className={styles.searchField}>
            <Label htmlFor="member-search">Search people</Label>
            <Input
              id="member-search"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search by name or email"
            />
          </div>
          <div className={styles.filterField}>
            <Label htmlFor="member-role-filter">Role</Label>
            <Select
              value={roleFilter}
              onValueChange={(value) => onRoleFilterChange(value as MemberFilter)}
            >
              <SelectTrigger id="member-role-filter" aria-label="Filter people by role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                {memberRoles.map((role) => (
                  <SelectItem value={role} key={role}>
                    {roleLabel(role)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className={styles.filterField}>
            <Label htmlFor="member-status-filter">Status</Label>
            <Select
              value={statusFilter}
              onValueChange={(value) => onStatusFilterChange(value as MemberStatusFilter)}
            >
              <SelectTrigger id="member-status-filter" aria-label="Filter people by status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="pending">Pending setup</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {loading ? <p className={styles.statusMessage}>Loading people…</p> : null}
        {!loading && workspaceError === null && members.length === 0 ? (
          <Empty className={styles.empty}>
            <EmptyHeader>
              <EmptyTitle>No one has been added yet</EmptyTitle>
              <EmptyDescription>
                Invite a teammate to give them organization access. Evaluators can finish setup from
                their email.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button type="button" onClick={onInvite}>
                Invite your first member
              </Button>
            </EmptyContent>
          </Empty>
        ) : null}
        {!loading && members.length > 0 && filteredMembers.length === 0 ? (
          <p className={styles.statusMessage} role="status" aria-live="polite">
            No people match the current search and filters.
          </p>
        ) : null}
        {filteredMembers.length > 0 ? (
          <Table>
            <caption className={styles.srOnly}>People and organization access</caption>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last updated</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMembers.map((member) => (
                <MemberRow
                  key={member.userId}
                  member={member}
                  busy={busyUserId === member.userId}
                  onRoleChange={onRoleChange}
                  onRevoke={onRevoke}
                />
              ))}
            </TableBody>
          </Table>
        ) : null}
      </CardContent>
      <CardFooter className={styles.cardFooter}>
        <span>{loading ? "" : `${filteredMembers.length} of ${members.length} people shown`}</span>
        <span>Owners are protected from accidental removal.</span>
      </CardFooter>
    </Card>
  );
}

function MemberInviteSection({
  memberOwnerKey,
  inviteDraft,
  inviteRole,
  inviteRoles,
  inviteBusy,
  apiAvailable,
  currentOrganizationRole,
  onSubmit,
  onUpdate,
  onRoleChange,
}: Readonly<{
  readonly memberOwnerKey: string;
  readonly inviteDraft: Readonly<{ email: string; name: string }>;
  readonly inviteRole: MemberRole;
  readonly inviteRoles: readonly MemberRole[];
  readonly inviteBusy: boolean;
  readonly apiAvailable: boolean;
  readonly currentOrganizationRole: MemberRole | undefined;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly onUpdate: (field: "email" | "name", value: string) => void;
  readonly onRoleChange: (value: MemberRole) => void;
}>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Invite member</CardTitle>
        <CardDescription>
          Send a secure email invitation. The recipient creates their own sign-in details during
          setup.
        </CardDescription>
      </CardHeader>
      <CardContent className={styles.cardContent}>
        <form key={memberOwnerKey} onSubmit={onSubmit} className={styles.formStack}>
          <div className={styles.fieldGrid}>
            <div className={styles.field}>
              <Label htmlFor="invite-name">Name</Label>
              <Input
                id="invite-name"
                type="text"
                value={inviteDraft.name}
                onChange={(event) => onUpdate("name", event.target.value)}
                maxLength={200}
                autoComplete="name"
                placeholder="Taylor Member"
              />
            </div>
            <div className={styles.field}>
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                value={inviteDraft.email}
                onChange={(event) => onUpdate("email", event.target.value)}
                maxLength={320}
                autoComplete="email"
                required
                placeholder="member@example.com"
              />
            </div>
            <div className={styles.field}>
              <Label htmlFor="invite-role">Access level</Label>
              <Select
                value={inviteRole}
                onValueChange={(value) => onRoleChange(value as MemberRole)}
                disabled={inviteBusy || !apiAvailable}
              >
                <SelectTrigger id="invite-role" aria-label="Choose an access level">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {inviteRoles.map((role) => (
                    <SelectItem value={role} key={role}>
                      {roleLabel(role)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className={styles.fieldHint}>
                {currentOrganizationRole === "owner"
                  ? "Owners can invite owners, admins, or evaluators."
                  : "Your organization role can invite evaluators only."}
              </p>
            </div>
          </div>
          <div className={styles.formActions}>
            <Button type="submit" disabled={inviteBusy || !apiAvailable}>
              {inviteBusy ? "Sending invitation…" : "Send invitation"}
            </Button>
            <span className={styles.fieldHint}>No credentials are created or shown here.</span>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function MemberSettingsSection({
  organizationDraft,
  organizationBusy,
  organizationNotice,
  onDraftChange,
  onUpdate,
}: Readonly<{
  readonly organizationDraft: OrganizationDraft;
  readonly organizationBusy: boolean;
  readonly organizationNotice: string | null;
  readonly onDraftChange: (field: keyof OrganizationDraft, value: string) => void;
  readonly onUpdate: (event: FormEvent<HTMLFormElement>) => void;
}>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Organization settings</CardTitle>
        <CardDescription>
          Update the current organization. Owner-only changes are checked on the server.
        </CardDescription>
      </CardHeader>
      <CardContent className={styles.cardContent}>
        <section className={styles.settingsSection} aria-labelledby="current-settings-heading">
          <div>
            <h2 id="current-settings-heading" className={styles.sectionTitle}>
              Current organization
            </h2>
            <p className={styles.fieldHint}>Update the display name or slug for this workspace.</p>
          </div>
          <form onSubmit={onUpdate} className={styles.formStack}>
            <div className={styles.fieldGrid}>
              <div className={styles.field}>
                <Label htmlFor="current-organization-name">Display name</Label>
                <Input
                  id="current-organization-name"
                  value={organizationDraft.name}
                  onChange={(event) => onDraftChange("name", event.target.value)}
                  maxLength={200}
                  placeholder="Your organization"
                />
              </div>
              <div className={styles.field}>
                <Label htmlFor="current-organization-slug">Workspace slug</Label>
                <Input
                  id="current-organization-slug"
                  value={organizationDraft.slug}
                  onChange={(event) => onDraftChange("slug", event.target.value)}
                  maxLength={64}
                  placeholder="your-team"
                />
              </div>
            </div>
            <details className={styles.advanced}>
              <summary>Advanced configuration (JSON)</summary>
              <div className={styles.field}>
                <Label htmlFor="organization-config">Configuration object</Label>
                <Textarea
                  id="organization-config"
                  value={organizationDraft.config}
                  onChange={(event) => onDraftChange("config", event.target.value)}
                  spellCheck={false}
                  className={styles.configInput}
                />
              </div>
            </details>
            <div className={styles.formActions}>
              <Button type="submit" variant="outline" disabled={organizationBusy}>
                {organizationBusy ? "Saving settings…" : "Save organization settings"}
              </Button>
            </div>
          </form>
        </section>

        {organizationNotice ? (
          <p className={styles.statusMessage} role="status" aria-live="polite">
            {organizationNotice}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
type WorkspaceTab = "people" | "invite" | "settings";

function MemberStatusMessage({
  message,
  error = false,
}: Readonly<{ message: string; error?: boolean }>) {
  if (error) {
    return (
      <Alert variant="destructive" className={styles.alert}>
        <AlertTitle>Action needed</AlertTitle>
        <AlertDescription>{message}</AlertDescription>
      </Alert>
    );
  }
  return (
    <p className={styles.statusMessage} role="status" aria-live="polite">
      {message}
    </p>
  );
}

export function MemberWorkspaceLayout({
  settingsOnly,
  currentOrganization,
  organizationsLoading,
  loading,
  loadOrganizations,
  loadMembers,
  workspaceError,
  notice,
  organizationsError,
  activeTab,
  onActiveTabChange,
  members,
  filteredMembers,
  query,
  roleFilter,
  statusFilter,
  busyUserId,
  onQueryChange,
  onRoleFilterChange,
  onStatusFilterChange,
  onInvite,
  onRoleChange,
  onRevoke,
  memberOwnerKey,
  inviteDraft,
  inviteRole,
  inviteRoles,
  inviteBusy,
  apiAvailable,
  onInviteSubmit,
  onInviteUpdate,
  onInviteRoleChange,
  organizationDraft,
  organizationBusy,
  organizationNotice,
  onOrganizationDraftChange,
  onOrganizationUpdate,
}: Readonly<{
  readonly settingsOnly: boolean;
  readonly currentOrganization: { readonly name: string; readonly role: MemberRole } | undefined;
  readonly organizationsLoading: boolean;
  readonly loading: boolean;
  readonly loadOrganizations: () => Promise<void>;
  readonly loadMembers: () => Promise<void>;
  readonly workspaceError: string | null;
  readonly notice: string | null;
  readonly organizationsError: string | null;
  readonly activeTab: WorkspaceTab;
  readonly onActiveTabChange: (value: WorkspaceTab) => void;
  readonly members: readonly OrganizationMember[];
  readonly filteredMembers: readonly OrganizationMember[];
  readonly query: string;
  readonly roleFilter: MemberFilter;
  readonly statusFilter: MemberStatusFilter;
  readonly busyUserId: string | null;
  readonly onQueryChange: (value: string) => void;
  readonly onRoleFilterChange: (value: MemberFilter) => void;
  readonly onStatusFilterChange: (value: MemberStatusFilter) => void;
  readonly onInvite: () => void;
  readonly onRoleChange: (member: OrganizationMember, role: MemberRole) => void;
  readonly onRevoke: (member: OrganizationMember) => void;
  readonly memberOwnerKey: string;
  readonly inviteDraft: Readonly<{ email: string; name: string }>;
  readonly inviteRole: MemberRole;
  readonly inviteRoles: readonly MemberRole[];
  readonly inviteBusy: boolean;
  readonly apiAvailable: boolean;
  readonly onInviteSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly onInviteUpdate: (field: "email" | "name", value: string) => void;
  readonly onInviteRoleChange: (value: MemberRole) => void;
  readonly organizationDraft: OrganizationDraft;
  readonly organizationBusy: boolean;
  readonly organizationNotice: string | null;
  readonly onOrganizationDraftChange: (field: keyof OrganizationDraft, value: string) => void;
  readonly onOrganizationUpdate: (event: FormEvent<HTMLFormElement>) => void;
}>) {
  return (
    <main className={styles.workspace}>
      <header className={styles.header}>
        <div className={styles.headerCopy}>
          <p className={styles.eyebrow}>Organization workspace</p>
          <h1 className={styles.title}>{settingsOnly ? "Settings" : "People"}</h1>
          <p className={styles.description}>
            {settingsOnly
              ? "Manage details and configuration for this organization."
              : "Manage who can access this organization and invite teammates for organizer or reviewer work."}
          </p>
          <p className={styles.contextLine}>
            {currentOrganization?.name ?? "Your organization"}
            {currentOrganization ? ` · ${roleLabel(currentOrganization.role)}` : ""}
          </p>
        </div>
        <div className={styles.headerActions}>
          <Button
            variant="outline"
            type="button"
            onClick={() => void (settingsOnly ? loadOrganizations() : loadMembers())}
            disabled={settingsOnly ? organizationsLoading : loading}
          >
            {settingsOnly
              ? organizationsLoading
                ? "Refreshing…"
                : "Refresh settings"
              : loading
                ? "Refreshing…"
                : "Refresh people"}
          </Button>
        </div>
      </header>

      {workspaceError ? <MemberStatusMessage message={workspaceError} error /> : null}
      {notice ? <MemberStatusMessage message={notice} /> : null}
      {settingsOnly && organizationsError ? (
        <MemberStatusMessage message={organizationsError} error />
      ) : null}

      <Tabs
        value={activeTab}
        onValueChange={(value) => onActiveTabChange(value as WorkspaceTab)}
        className={styles.tabs}
      >
        {!settingsOnly ? (
          <TabsList className={styles.tabList} aria-label="People workspace sections">
            <TabsTrigger value="people">People</TabsTrigger>
            <TabsTrigger value="invite">Invite member</TabsTrigger>
          </TabsList>
        ) : null}

        <TabsContent value="people" className={styles.tabContent}>
          <MemberPeopleSection
            members={members}
            filteredMembers={filteredMembers}
            loading={loading}
            workspaceError={workspaceError}
            query={query}
            roleFilter={roleFilter}
            statusFilter={statusFilter}
            busyUserId={busyUserId}
            onQueryChange={onQueryChange}
            onRoleFilterChange={onRoleFilterChange}
            onStatusFilterChange={onStatusFilterChange}
            onInvite={onInvite}
            onRoleChange={onRoleChange}
            onRevoke={onRevoke}
          />
        </TabsContent>

        <TabsContent value="invite" className={styles.tabContent}>
          <MemberInviteSection
            memberOwnerKey={memberOwnerKey}
            inviteDraft={inviteDraft}
            inviteRole={inviteRole}
            inviteRoles={inviteRoles}
            inviteBusy={inviteBusy}
            apiAvailable={apiAvailable}
            currentOrganizationRole={currentOrganization?.role}
            onSubmit={onInviteSubmit}
            onUpdate={onInviteUpdate}
            onRoleChange={onInviteRoleChange}
          />
        </TabsContent>

        <TabsContent value="settings" className={styles.tabContent} aria-label="Settings">
          <MemberSettingsSection
            organizationDraft={organizationDraft}
            organizationBusy={organizationBusy}
            organizationNotice={organizationNotice}
            onDraftChange={onOrganizationDraftChange}
            onUpdate={onOrganizationUpdate}
          />
        </TabsContent>
      </Tabs>
    </main>
  );
}
