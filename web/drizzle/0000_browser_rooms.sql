CREATE TABLE `rooms` (
  `code` text PRIMARY KEY NOT NULL,
  `revision` integer DEFAULT 0 NOT NULL,
  `data` text NOT NULL,
  `updated_at` real NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rooms_updated_at` ON `rooms` (`updated_at`);
--> statement-breakpoint
CREATE TABLE `sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `token` text NOT NULL,
  `code` text,
  `name` text DEFAULT 'Player' NOT NULL,
  `updated_at` real NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sessions_updated_at` ON `sessions` (`updated_at`);
