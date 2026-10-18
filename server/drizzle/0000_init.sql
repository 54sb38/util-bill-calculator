CREATE TABLE `bill_participants` (
	`bill_id` integer NOT NULL,
	`person_id` integer NOT NULL,
	`included` integer DEFAULT true NOT NULL,
	`weight` real,
	`custom_amount_cents` integer,
	PRIMARY KEY(`bill_id`, `person_id`),
	FOREIGN KEY (`bill_id`) REFERENCES `bills`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "bill_participants_weight_ck" CHECK(weight IS NULL OR weight > 0),
	CONSTRAINT "bill_participants_custom_ck" CHECK(custom_amount_cents IS NULL OR custom_amount_cents >= 0)
);
--> statement-breakpoint
CREATE TABLE `bill_shares` (
	`bill_id` integer NOT NULL,
	`person_id` integer NOT NULL,
	`amount_cents` integer NOT NULL,
	`days_counted` integer,
	`weight_used` real,
	PRIMARY KEY(`bill_id`, `person_id`),
	FOREIGN KEY (`bill_id`) REFERENCES `bills`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "bill_shares_amount_ck" CHECK(amount_cents >= 0)
);
--> statement-breakpoint
CREATE INDEX `bill_shares_person_idx` ON `bill_shares` (`person_id`);--> statement-breakpoint
CREATE TABLE `bill_types` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`home_id` integer NOT NULL,
	`name` text NOT NULL,
	`default_split_method` text DEFAULT 'by_days' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`home_id`) REFERENCES `homes`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "bill_types_split_method_ck" CHECK(default_split_method IN ('by_days', 'equal', 'weights', 'custom'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bill_types_home_name_uq` ON `bill_types` (`home_id`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `bill_types_id_home_uq` ON `bill_types` (`id`,`home_id`);--> statement-breakpoint
CREATE TABLE `bills` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`home_id` integer NOT NULL,
	`bill_type_id` integer NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`split_method` text NOT NULL,
	`notes` text,
	`calculated_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`home_id`) REFERENCES `homes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bill_type_id`,`home_id`) REFERENCES `bill_types`(`id`,`home_id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "bills_dates_ck" CHECK(end_date >= start_date),
	CONSTRAINT "bills_amount_ck" CHECK(amount_cents > 0),
	CONSTRAINT "bills_split_method_ck" CHECK(split_method IN ('by_days', 'equal', 'weights', 'custom'))
);
--> statement-breakpoint
CREATE INDEX `bills_home_start_idx` ON `bills` (`home_id`,`start_date`);--> statement-breakpoint
CREATE INDEX `bills_bill_type_idx` ON `bills` (`bill_type_id`);--> statement-breakpoint
CREATE TABLE `homes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`address` text,
	`notes` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `people` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`home_id` integer NOT NULL,
	`name` text NOT NULL,
	`default_weight` real DEFAULT 1 NOT NULL,
	`archived_at` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`home_id`) REFERENCES `homes`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "people_default_weight_ck" CHECK(default_weight > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `people_home_name_uq` ON `people` (`home_id`,`name`);--> statement-breakpoint
CREATE TABLE `stays` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`person_id` integer NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text,
	`note` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "stays_dates_ck" CHECK(end_date IS NULL OR end_date >= start_date)
);
--> statement-breakpoint
CREATE INDEX `stays_person_start_idx` ON `stays` (`person_id`,`start_date`);