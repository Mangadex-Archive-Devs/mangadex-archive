CREATE TABLE `manga` ( `mangaId` INTEGER NOT NULL UNIQUE, `title` TEXT, `path` TEXT NOT NULL, `torrentFilename` TEXT NOT NULL, `timestamp` INTEGER NOT NULL, PRIMARY KEY(`mangaId`) );
CREATE TABLE `archived` ( `mangaId` INTEGER NOT NULL UNIQUE, `timestamp` INTEGER NOT NULL, PRIMARY KEY(`mangaId`) )