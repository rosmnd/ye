-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Oct 04, 2026 at 01:18 PM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `cswdo_mis_db`
--

-- --------------------------------------------------------

--
-- Table structure for table `applications`
--

CREATE TABLE `applications` (
  `control_number` varchar(50) NOT NULL,
  `client_name` varchar(120) NOT NULL,
  `client_type` enum('Online','Walk-In') NOT NULL,
  `assistance_type` varchar(50) NOT NULL,
  `schedule_date` date NOT NULL,
  `schedule_slot` enum('AM','PM','Walk-In') NOT NULL,
  `attachments_list` text DEFAULT NULL,
  `application_status` enum('Pending Validation','for Interview','For Admin Approval','Approved','Released') DEFAULT 'Pending Validation',
  `created_at` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `applications`
--

INSERT INTO `applications` (`control_number`, `client_name`, `client_type`, `assistance_type`, `schedule_date`, `schedule_slot`, `attachments_list`, `application_status`, `created_at`) VALUES
('CN-2026-0001', 'Maria Clara Santos', 'Online', 'Medical Assistance', '2026-10-04', 'AM', 'Pasig Pass QR, Medical Abstract, Barangay Indigency, Valid ID', 'Pending Validation', '2026-10-04 19:17:55'),
('CN-2026-0002', 'Juan Dela Cruz', 'Online', 'Financial Assistance', '2026-10-04', 'AM', 'Pasig Pass QR, Barangay Certificate of Indigency, Valid ID', 'Pending Validation', '2026-10-04 19:17:55'),
('CN-2026-0003', 'Roberto Reyes', 'Online', 'Burial Assistance', '2026-10-04', 'PM', 'Pasig Pass QR, Death Certificate, Funeral Contract, Valid ID', 'Pending Validation', '2026-10-04 19:17:55'),
('CN-2026-0004', 'Elena Magtanggol', 'Walk-In', 'Balik Probinsiya', '2026-10-04', 'Walk-In', 'Pasig Pass QR, Social Case Referral, Valid ID', 'Pending Validation', '2026-10-04 19:17:55');

-- --------------------------------------------------------

--
-- Table structure for table `queue_logs`
--

CREATE TABLE `queue_logs` (
  `queue_id` int(11) NOT NULL,
  `queue_code` varchar(30) NOT NULL,
  `control_number` varchar(50) NOT NULL,
  `client_type` enum('Online','Walk-In') NOT NULL,
  `schedule_slot` enum('AM','PM','Walk-In') NOT NULL,
  `queue_number` int(11) NOT NULL,
  `queue_status` enum('Waiting','Called','In Interview','For Admin Evaluation','Approved - Ready for Release','Released','No Show') DEFAULT 'Waiting',
  `assigned_window` varchar(50) DEFAULT NULL,
  `interviewer_name` varchar(100) DEFAULT NULL,
  `queue_date` date NOT NULL,
  `time_checked_in` datetime DEFAULT current_timestamp(),
  `time_interview` time DEFAULT NULL,
  `time_released` time DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `system_notifications`
--

CREATE TABLE `system_notifications` (
  `notification_id` int(11) NOT NULL,
  `control_number` varchar(50) NOT NULL,
  `queue_code` varchar(30) NOT NULL,
  `sender_role` enum('Employee','Interviewer','Admin') NOT NULL,
  `recipient_role` enum('Employee','Interviewer','Admin') NOT NULL,
  `alert_type` enum('Alert','Notification','Message') NOT NULL DEFAULT 'Notification',
  `alert_title` varchar(120) NOT NULL,
  `message_body` text NOT NULL,
  `is_read` tinyint(1) DEFAULT 0,
  `created_at` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Indexes for dumped tables
--

--
-- Indexes for table `applications`
--
ALTER TABLE `applications`
  ADD PRIMARY KEY (`control_number`);

--
-- Indexes for table `queue_logs`
--
ALTER TABLE `queue_logs`
  ADD PRIMARY KEY (`queue_id`),
  ADD UNIQUE KEY `queue_code` (`queue_code`),
  ADD KEY `control_number` (`control_number`);

--
-- Indexes for table `system_notifications`
--
ALTER TABLE `system_notifications`
  ADD PRIMARY KEY (`notification_id`),
  ADD KEY `control_number` (`control_number`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `queue_logs`
--
ALTER TABLE `queue_logs`
  MODIFY `queue_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `system_notifications`
--
ALTER TABLE `system_notifications`
  MODIFY `notification_id` int(11) NOT NULL AUTO_INCREMENT;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `queue_logs`
--
ALTER TABLE `queue_logs`
  ADD CONSTRAINT `queue_logs_ibfk_1` FOREIGN KEY (`control_number`) REFERENCES `applications` (`control_number`) ON UPDATE CASCADE;

--
-- Constraints for table `system_notifications`
--
ALTER TABLE `system_notifications`
  ADD CONSTRAINT `system_notifications_ibfk_1` FOREIGN KEY (`control_number`) REFERENCES `applications` (`control_number`) ON UPDATE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
