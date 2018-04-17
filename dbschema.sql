CREATE TABLE "archived" ( `mangaId` INTEGER NOT NULL UNIQUE, `timestamp` INTEGER NOT NULL, `anidexId` INTEGER, PRIMARY KEY(`mangaId`) );
CREATE TABLE "stats" (
	`mangaId`	INTEGER NOT NULL UNIQUE,
	`mangaTitle`	TEXT,
	`volStart`	INTEGER,
	`volCount`	INTEGER,
	`chStart`	BLOB,
	`chCount`	INTEGER,
	`chGaps`	INTEGER,
	`lastUpload`	INTEGER,
	`hasEndTag`	INTEGER,
	`status`	TEXT,
	`isArchiveable`	INTEGER,
	`description`	TEXT,
	PRIMARY KEY(`mangaId`)
);