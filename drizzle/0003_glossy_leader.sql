CREATE TABLE `stock` (
	`id` int AUTO_INCREMENT NOT NULL,
	`dosage` varchar(20) NOT NULL,
	`available` int NOT NULL DEFAULT 0,
	`lot` int NOT NULL DEFAULT 10,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `stock_id` PRIMARY KEY(`id`),
	CONSTRAINT `stock_dosage_unique` UNIQUE(`dosage`)
);
--> statement-breakpoint
ALTER TABLE `orders` ADD `clientIp` varchar(64);