import {sqliteTable,text,integer,primaryKey,index,check} from 'drizzle-orm/sqlite-core';
import {sql} from 'drizzle-orm';
export const accounts=sqliteTable('accounts',{id:text('id').primaryKey(),provider:text('provider').notNull().unique(),name:text('name').notNull(),email:text('email').notNull()});
export const houses=sqliteTable('houses',{id:text('id').primaryKey(),name:text('name').notNull(),owner:text('owner').notNull(),data:text('data').notNull(),revision:integer('revision').notNull(),op_count:integer('op_count').notNull().default(0),receipt_count:integer('receipt_count').notNull().default(0)});
export const members=sqliteTable('members',{user:text('user').primaryKey(),house:text('house').notNull(),role:text('role').notNull(),active:integer('active').notNull()},t=>[index('members_house_idx').on(t.house)]);
export const invites=sqliteTable('invites',{token:text('token').primaryKey(),id:text('id').notNull().unique(),house:text('house').notNull(),role:text('role').notNull(),expires:integer('expires').notNull(),used:integer('used').notNull(),created_by:text('created_by').notNull()},t=>[index('invites_house_idx').on(t.house)]);
export const operations=sqliteTable('operations',{house:text('house').notNull(),actor:text('actor').notNull(),id:text('id').notNull(),changes:text('changes').notNull(),at:integer('at').notNull()},t=>[primaryKey({columns:[t.house,t.actor,t.id]}),index('operations_activity_idx').on(t.house,t.at)]);
export const receipts=sqliteTable('receipts',{house:text('house').notNull(),grp:text('grp').notNull(),entry:text('entry').notNull(),id:text('id').notNull(),meta:text('meta').notNull(),ready:integer('ready').notNull()},t=>[primaryKey({columns:[t.house,t.grp,t.entry,t.id]})]);
export const assertions=sqliteTable('assertions',{ok:integer('ok').notNull()},t=>[check('transaction_revision_matches',sql`${t.ok}=1`)]);
export const rate_limits=sqliteTable('rate_limits',{key:text('key').primaryKey(),window:integer('window').notNull(),hits:integer('hits').notNull()});
export const cleanup=sqliteTable('cleanup',{key:text('key').primaryKey()});

// E2EE tables never store family names, record paths, values or receipt metadata.
export const secure_vaults=sqliteTable('secure_vaults',{user:text('user').primaryKey(),data:text('data').notNull(),revision:integer('revision').notNull()});
export const secure_houses=sqliteTable('secure_houses',{id:text('id').primaryKey(),owner:text('owner').notNull(),epoch:text('epoch').notNull(),data:text('data').notNull(),revision:integer('revision').notNull(),op_count:integer('op_count').notNull().default(0),audit_bytes:integer('audit_bytes').notNull().default(0),receipt_count:integer('receipt_count').notNull().default(0)});
export const secure_members=sqliteTable('secure_members',{user:text('user').primaryKey(),house:text('house').notNull(),role:text('role').notNull(),active:integer('active').notNull()},t=>[index('secure_members_house_idx').on(t.house)]);
export const secure_invites=sqliteTable('secure_invites',{token:text('token').primaryKey(),id:text('id').notNull().unique(),house:text('house').notNull(),epoch:text('epoch').notNull(),role:text('role').notNull(),target:text('target'),expires:integer('expires').notNull(),used:integer('used').notNull(),packet:text('packet').notNull()},t=>[index('secure_invites_house_idx').on(t.house)]);
export const secure_operations=sqliteTable('secure_operations',{house:text('house').notNull(),actor:text('actor').notNull(),id:text('id').notNull(),epoch:text('epoch').notNull(),revision:integer('revision').notNull(),changes:text('changes').notNull(),at:integer('at').notNull()},t=>[primaryKey({columns:[t.house,t.actor,t.id]}),index('secure_operations_revision_idx').on(t.house,t.revision)]);
export const secure_receipts=sqliteTable('secure_receipts',{house:text('house').notNull(),epoch:text('epoch').notNull(),id:text('id').notNull(),key:text('key').notNull(),digest:text('digest').notNull(),actor:text('actor').notNull(),at:integer('at').notNull(),ready:integer('ready').notNull()},t=>[primaryKey({columns:[t.house,t.epoch,t.id]})]);

// Temporary access-code sessions hold only hashed browser tokens and account metadata.
export const test_sessions=sqliteTable('test_sessions',{token:text('token').primaryKey(),user:text('user').notNull(),subject:text('subject').notNull(),code_hash:text('code_hash').notNull(),expires:integer('expires').notNull()},t=>[index('test_sessions_user_idx').on(t.user),index('test_sessions_expires_idx').on(t.expires)]);

// Operational push metadata only; notification messages never contain family content.
export const push_subscriptions=sqliteTable('push_subscriptions',{id:text('id').primaryKey(),user:text('user').notNull(),endpoint:text('endpoint').notNull(),p256dh:text('p256dh').notNull(),auth:text('auth').notNull(),prefs:text('prefs').notNull(),mode:text('mode').notNull(),updated_at:integer('updated_at').notNull()},t=>[index('push_subscriptions_user_idx').on(t.user)]);
export const push_deliveries=sqliteTable('push_deliveries',{id:text('id').primaryKey(),subscription:text('subscription').notNull(),house:text('house').notNull(),kind:text('kind').notNull(),created_at:integer('created_at').notNull(),next_at:integer('next_at').notNull(),attempts:integer('attempts').notNull(),lease_until:integer('lease_until').notNull()},t=>[index('push_deliveries_due_idx').on(t.next_at,t.lease_until)]);

export const auth_cleanup=sqliteTable('auth_cleanup',{id:text('id').primaryKey(),subject:text('subject'),created_at:integer('created_at').notNull(),attempts:integer('attempts').notNull(),next_at:integer('next_at').notNull()});

// Provider-authenticated account restoration; root material is server-wrapped.
export const managedAccountKeys = sqliteTable("managed_account_keys", {
 user: text("user").primaryKey(),
 data: text("data").notNull(),
 legacyVault: text("legacy_vault"),
 createdAt: integer("created_at").notNull(),
});
