-- Optional addon from CSWDO Queue Management module
-- Safe to run AFTER importing sql/cswdo_db.sql
-- These tables are extras used by the queue UI prototype; the main
-- appointment/admin flow uses the existing `queues` + `notifications` tables.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS `queue_logs` (
  `queue_id` int(11) NOT NULL AUTO_INCREMENT,
  `queue_code` varchar(30) NOT NULL,
  `control_number` varchar(50) NOT NULL,
  `client_name` varchar(120) NOT NULL,
  `assistance_type` varchar(50) DEFAULT NULL,
  `queue_status` enum('Waiting','Called','Serving','Done','Skipped','No-Show') DEFAULT 'Waiting',
  `priority` enum('Normal','Priority','Senior','PWD') DEFAULT 'Normal',
  `window_slot` enum('AM','PM','Walk-In') DEFAULT 'AM',
  `called_at` datetime DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`queue_id`),
  KEY `idx_control_number` (`control_number`),
  KEY `idx_queue_status` (`queue_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `system_notifications` (
  `notification_id` int(11) NOT NULL AUTO_INCREMENT,
  `control_number` varchar(50) DEFAULT NULL,
  `title` varchar(150) NOT NULL,
  `message` text NOT NULL,
  `audience` enum('Client','Employee','Admin','All') DEFAULT 'All',
  `is_read` tinyint(1) DEFAULT 0,
  `created_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`notification_id`),
  KEY `idx_audience` (`audience`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

SET FOREIGN_KEY_CHECKS = 1;
