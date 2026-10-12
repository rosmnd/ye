-- MariaDB dump 10.19  Distrib 10.4.32-MariaDB, for Win64 (AMD64)
--
-- Host: localhost    Database: cswdo_db
-- ------------------------------------------------------
-- Server version	10.4.32-MariaDB

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `admin_reviews`
--

DROP TABLE IF EXISTS `admin_reviews`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `admin_reviews` (
  `review_id` int(11) NOT NULL AUTO_INCREMENT,
  `application_id` int(11) NOT NULL,
  `admin_id` int(11) NOT NULL,
  `review_start_time` datetime NOT NULL,
  `review_end_time` datetime DEFAULT NULL,
  `decision` enum('APPROVED','RETURNED_FOR_CORRECTION') DEFAULT NULL,
  `admin_remarks` text DEFAULT NULL,
  `priority_level` enum('NORMAL','REMINDER','OVERDUE') DEFAULT 'NORMAL',
  PRIMARY KEY (`review_id`),
  KEY `application_id` (`application_id`),
  KEY `admin_id` (`admin_id`),
  CONSTRAINT `admin_reviews_ibfk_1` FOREIGN KEY (`application_id`) REFERENCES `applications` (`application_id`) ON DELETE CASCADE,
  CONSTRAINT `admin_reviews_ibfk_2` FOREIGN KEY (`admin_id`) REFERENCES `employees` (`employee_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `admin_reviews`
--

LOCK TABLES `admin_reviews` WRITE;
/*!40000 ALTER TABLE `admin_reviews` DISABLE KEYS */;
/*!40000 ALTER TABLE `admin_reviews` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `application_documents`
--

DROP TABLE IF EXISTS `application_documents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `application_documents` (
  `document_id` int(11) NOT NULL AUTO_INCREMENT,
  `application_id` int(11) NOT NULL,
  `requirement_id` int(11) NOT NULL,
  `file_path` varchar(255) NOT NULL,
  `verification_status` enum('PENDING','VALIDATED','INCOMPLETE','REJECTED') DEFAULT 'PENDING',
  `verifier_remarks` text DEFAULT NULL,
  `verified_by_employee_id` int(11) DEFAULT NULL,
  `verified_at` datetime DEFAULT NULL,
  PRIMARY KEY (`document_id`),
  KEY `application_id` (`application_id`),
  KEY `requirement_id` (`requirement_id`),
  KEY `verified_by_employee_id` (`verified_by_employee_id`),
  CONSTRAINT `application_documents_ibfk_1` FOREIGN KEY (`application_id`) REFERENCES `applications` (`application_id`) ON DELETE CASCADE,
  CONSTRAINT `application_documents_ibfk_2` FOREIGN KEY (`requirement_id`) REFERENCES `assistance_requirements` (`requirement_id`),
  CONSTRAINT `application_documents_ibfk_3` FOREIGN KEY (`verified_by_employee_id`) REFERENCES `employees` (`employee_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `application_documents`
--

LOCK TABLES `application_documents` WRITE;
/*!40000 ALTER TABLE `application_documents` DISABLE KEYS */;
/*!40000 ALTER TABLE `application_documents` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `application_status_history`
--

DROP TABLE IF EXISTS `application_status_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `application_status_history` (
  `history_id` int(11) NOT NULL AUTO_INCREMENT,
  `application_id` int(11) NOT NULL,
  `status_from` varchar(50) NOT NULL,
  `status_to` varchar(50) NOT NULL,
  `changed_by_user_id` int(11) NOT NULL,
  `remarks` text DEFAULT NULL,
  `changed_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`history_id`),
  KEY `application_id` (`application_id`),
  KEY `changed_by_user_id` (`changed_by_user_id`),
  CONSTRAINT `application_status_history_ibfk_1` FOREIGN KEY (`application_id`) REFERENCES `applications` (`application_id`) ON DELETE CASCADE,
  CONSTRAINT `application_status_history_ibfk_2` FOREIGN KEY (`changed_by_user_id`) REFERENCES `users` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `application_status_history`
--

LOCK TABLES `application_status_history` WRITE;
/*!40000 ALTER TABLE `application_status_history` DISABLE KEYS */;
/*!40000 ALTER TABLE `application_status_history` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `applications`
--

DROP TABLE IF EXISTS `applications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `applications` (
  `application_id` int(11) NOT NULL AUTO_INCREMENT,
  `control_number` varchar(50) NOT NULL,
  `client_id` int(11) NOT NULL,
  `assistance_type_id` int(11) NOT NULL,
  `requested_output_type` enum('Social Case Study Report','Certificate of Indigency','Direct Financial Assistance','Other') DEFAULT 'Direct Financial Assistance',
  `is_client_the_beneficiary` tinyint(1) DEFAULT 1,
  `beneficiary_name` varchar(150) DEFAULT NULL COMMENT 'Filled if client is applying on behalf of a patient/beneficiary',
  `beneficiary_relationship` varchar(50) DEFAULT NULL,
  `application_type` enum('ONLINE','WALK_IN') NOT NULL DEFAULT 'ONLINE',
  `current_status` enum('APPLICATION_SUBMITTED','FOR_REVIEW','REVIEWING','FOR_CORRECTION','FOR_INTERVIEW','INTERVIEW_IN_PROGRESS','INTERVIEW_COMPLETED','STAFF_REPORT_READY','FOR_ADMIN_REVIEW','ADMIN_REVIEWING','RETURNED_FOR_CORRECTION','APPROVED','ASSISTANCE_PROCESSING','COMPLETED') NOT NULL DEFAULT 'APPLICATION_SUBMITTED',
  `requesting_agency` varchar(150) DEFAULT NULL,
  `submission_date` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`application_id`),
  UNIQUE KEY `control_number` (`control_number`),
  KEY `client_id` (`client_id`),
  KEY `assistance_type_id` (`assistance_type_id`),
  CONSTRAINT `applications_ibfk_1` FOREIGN KEY (`client_id`) REFERENCES `client_profiles` (`client_id`),
  CONSTRAINT `applications_ibfk_2` FOREIGN KEY (`assistance_type_id`) REFERENCES `assistance_types` (`assistance_type_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `applications`
--

LOCK TABLES `applications` WRITE;
/*!40000 ALTER TABLE `applications` DISABLE KEYS */;
/*!40000 ALTER TABLE `applications` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `appointments`
--

DROP TABLE IF EXISTS `appointments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `appointments` (
  `appointment_id` int(11) NOT NULL AUTO_INCREMENT,
  `application_id` int(11) NOT NULL,
  `schedule_id` int(11) NOT NULL,
  `appointment_status` enum('SCHEDULED','CHECKED_IN','LATE','RESCHEDULED','CANCELLED') DEFAULT 'SCHEDULED',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`appointment_id`),
  UNIQUE KEY `application_id` (`application_id`),
  KEY `schedule_id` (`schedule_id`),
  CONSTRAINT `appointments_ibfk_1` FOREIGN KEY (`application_id`) REFERENCES `applications` (`application_id`) ON DELETE CASCADE,
  CONSTRAINT `appointments_ibfk_2` FOREIGN KEY (`schedule_id`) REFERENCES `schedule_capacities` (`schedule_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `appointments`
--

LOCK TABLES `appointments` WRITE;
/*!40000 ALTER TABLE `appointments` DISABLE KEYS */;
/*!40000 ALTER TABLE `appointments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `assistance_requirements`
--

DROP TABLE IF EXISTS `assistance_requirements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `assistance_requirements` (
  `requirement_id` int(11) NOT NULL AUTO_INCREMENT,
  `assistance_type_id` int(11) NOT NULL,
  `document_name` varchar(150) NOT NULL,
  `description` text DEFAULT NULL,
  `is_mandatory` tinyint(1) DEFAULT 1,
  PRIMARY KEY (`requirement_id`),
  KEY `assistance_type_id` (`assistance_type_id`),
  CONSTRAINT `assistance_requirements_ibfk_1` FOREIGN KEY (`assistance_type_id`) REFERENCES `assistance_types` (`assistance_type_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `assistance_requirements`
--

LOCK TABLES `assistance_requirements` WRITE;
/*!40000 ALTER TABLE `assistance_requirements` DISABLE KEYS */;
/*!40000 ALTER TABLE `assistance_requirements` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `assistance_types`
--

DROP TABLE IF EXISTS `assistance_types`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `assistance_types` (
  `assistance_type_id` int(11) NOT NULL AUTO_INCREMENT,
  `service_name` varchar(100) NOT NULL,
  `description` text DEFAULT NULL,
  `cooldown_months` int(11) DEFAULT 3,
  `is_active` tinyint(1) DEFAULT 1,
  PRIMARY KEY (`assistance_type_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `assistance_types`
--

LOCK TABLES `assistance_types` WRITE;
/*!40000 ALTER TABLE `assistance_types` DISABLE KEYS */;
/*!40000 ALTER TABLE `assistance_types` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `client_profiles`
--

DROP TABLE IF EXISTS `client_profiles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `client_profiles` (
  `client_id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `first_name` varchar(50) NOT NULL,
  `middle_name` varchar(50) DEFAULT NULL,
  `last_name` varchar(50) NOT NULL,
  `birth_date` date NOT NULL,
  `birth_place` varchar(100) NOT NULL,
  `age` int(11) NOT NULL,
  `sex` enum('Male','Female') NOT NULL,
  `civil_status` enum('Single','Married','Widowed','Separated','Others') NOT NULL,
  `sectoral_category` enum('4Ps','Solo Parent','Senior Citizen','PWD','Other','None') DEFAULT 'None',
  `is_pwd` tinyint(1) DEFAULT 0,
  `pwd_id_no` varchar(50) DEFAULT NULL,
  `educational_attainment` varchar(100) DEFAULT NULL,
  `occupation` varchar(100) DEFAULT NULL,
  `monthly_income` decimal(10,2) DEFAULT 0.00,
  `unit_number` varchar(50) DEFAULT NULL COMMENT 'e.g. N/A, Unit 3B',
  `house_number` varchar(50) DEFAULT NULL COMMENT 'e.g. 4-1, #12',
  `street_name_subdivision` varchar(150) NOT NULL COMMENT 'e.g. Westbank Rd Floodway',
  `permanent_address` text NOT NULL COMMENT 'Full concatenated address string',
  `barangay` varchar(100) NOT NULL COMMENT 'e.g. Maybunga',
  `housing_status` enum('Owned','Renter','Sharer/Relative') NOT NULL,
  `monthly_rent` decimal(10,2) DEFAULT 0.00,
  `monthly_expenses_electricity` decimal(10,2) DEFAULT 0.00,
  `monthly_expenses_water` decimal(10,2) DEFAULT 0.00,
  `monthly_expenses_food` decimal(10,2) DEFAULT 0.00,
  `other_sources_of_help` text DEFAULT NULL,
  PRIMARY KEY (`client_id`),
  UNIQUE KEY `user_id` (`user_id`),
  CONSTRAINT `client_profiles_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `client_profiles`
--

LOCK TABLES `client_profiles` WRITE;
/*!40000 ALTER TABLE `client_profiles` DISABLE KEYS */;
/*!40000 ALTER TABLE `client_profiles` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `customer_feedbacks`
--

DROP TABLE IF EXISTS `customer_feedbacks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `customer_feedbacks` (
  `feedback_id` int(11) NOT NULL AUTO_INCREMENT,
  `application_id` int(11) NOT NULL,
  `rating` int(11) DEFAULT NULL CHECK (`rating` between 1 and 5),
  `comments` text DEFAULT NULL,
  `submitted_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`feedback_id`),
  UNIQUE KEY `application_id` (`application_id`),
  CONSTRAINT `customer_feedbacks_ibfk_1` FOREIGN KEY (`application_id`) REFERENCES `applications` (`application_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `customer_feedbacks`
--

LOCK TABLES `customer_feedbacks` WRITE;
/*!40000 ALTER TABLE `customer_feedbacks` DISABLE KEYS */;
/*!40000 ALTER TABLE `customer_feedbacks` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `employees`
--

DROP TABLE IF EXISTS `employees`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `employees` (
  `employee_id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `employee_number` varchar(30) NOT NULL,
  `first_name` varchar(50) NOT NULL,
  `last_name` varchar(50) NOT NULL,
  `position` varchar(50) NOT NULL,
  `prc_license_no` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`employee_id`),
  UNIQUE KEY `user_id` (`user_id`),
  UNIQUE KEY `employee_number` (`employee_number`),
  CONSTRAINT `employees_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `employees`
--

LOCK TABLES `employees` WRITE;
/*!40000 ALTER TABLE `employees` DISABLE KEYS */;
/*!40000 ALTER TABLE `employees` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `family_members`
--

DROP TABLE IF EXISTS `family_members`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `family_members` (
  `family_member_id` int(11) NOT NULL AUTO_INCREMENT,
  `client_id` int(11) NOT NULL,
  `full_name` varchar(150) NOT NULL,
  `age` int(11) NOT NULL,
  `sex` enum('Male','Female') NOT NULL,
  `civil_status` varchar(50) DEFAULT NULL,
  `relationship` varchar(50) NOT NULL,
  `educational_attainment` varchar(100) DEFAULT NULL,
  `occupation` varchar(100) DEFAULT NULL,
  `monthly_income` decimal(10,2) DEFAULT 0.00,
  PRIMARY KEY (`family_member_id`),
  KEY `client_id` (`client_id`),
  CONSTRAINT `family_members_ibfk_1` FOREIGN KEY (`client_id`) REFERENCES `client_profiles` (`client_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `family_members`
--

LOCK TABLES `family_members` WRITE;
/*!40000 ALTER TABLE `family_members` DISABLE KEYS */;
/*!40000 ALTER TABLE `family_members` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `interview_phrase_chips`
--

DROP TABLE IF EXISTS `interview_phrase_chips`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `interview_phrase_chips` (
  `chip_id` int(11) NOT NULL AUTO_INCREMENT,
  `field_target` enum('PROBLEM_PRESENTED','BRIEF_FINDINGS','SOCIO_ECONOMIC_EVALUATION','RECOMMENDATION') NOT NULL,
  `chip_label` varchar(100) NOT NULL,
  `phrase_text` varchar(255) NOT NULL,
  PRIMARY KEY (`chip_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `interview_phrase_chips`
--

LOCK TABLES `interview_phrase_chips` WRITE;
/*!40000 ALTER TABLE `interview_phrase_chips` DISABLE KEYS */;
/*!40000 ALTER TABLE `interview_phrase_chips` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `interview_templates`
--

DROP TABLE IF EXISTS `interview_templates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `interview_templates` (
  `template_id` int(11) NOT NULL AUTO_INCREMENT,
  `assistance_type_id` int(11) NOT NULL,
  `field_target` enum('PROBLEM_PRESENTED','BRIEF_FINDINGS','SOCIO_ECONOMIC_EVALUATION','RECOMMENDATION') NOT NULL,
  `template_label` varchar(255) NOT NULL,
  `default_text` text NOT NULL,
  PRIMARY KEY (`template_id`),
  KEY `assistance_type_id` (`assistance_type_id`),
  CONSTRAINT `interview_templates_ibfk_1` FOREIGN KEY (`assistance_type_id`) REFERENCES `assistance_types` (`assistance_type_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `interview_templates`
--

LOCK TABLES `interview_templates` WRITE;
/*!40000 ALTER TABLE `interview_templates` DISABLE KEYS */;
/*!40000 ALTER TABLE `interview_templates` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `notifications`
--

DROP TABLE IF EXISTS `notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `notifications` (
  `notification_id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `title` varchar(150) NOT NULL,
  `message` text NOT NULL,
  `is_read` tinyint(1) DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`notification_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `notifications_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notifications`
--

LOCK TABLES `notifications` WRITE;
/*!40000 ALTER TABLE `notifications` DISABLE KEYS */;
/*!40000 ALTER TABLE `notifications` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `queues`
--

DROP TABLE IF EXISTS `queues`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `queues` (
  `queue_id` int(11) NOT NULL AUTO_INCREMENT,
  `application_id` int(11) NOT NULL,
  `queue_number` varchar(20) NOT NULL,
  `queue_type` enum('ONLINE_VERIFICATION','WALK_IN_ENTRY','RE_QUEUE','CORRECTION_QUEUE') NOT NULL,
  `queue_date` date NOT NULL,
  `time_window` enum('AM','PM') NOT NULL,
  `queue_status` enum('WAITING','CALLED','SERVING','COMPLETED','NO_SHOW') DEFAULT 'WAITING',
  `called_at` datetime DEFAULT NULL,
  PRIMARY KEY (`queue_id`),
  KEY `application_id` (`application_id`),
  CONSTRAINT `queues_ibfk_1` FOREIGN KEY (`application_id`) REFERENCES `applications` (`application_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `queues`
--

LOCK TABLES `queues` WRITE;
/*!40000 ALTER TABLE `queues` DISABLE KEYS */;
/*!40000 ALTER TABLE `queues` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `schedule_capacities`
--

DROP TABLE IF EXISTS `schedule_capacities`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `schedule_capacities` (
  `schedule_id` int(11) NOT NULL AUTO_INCREMENT,
  `schedule_date` date NOT NULL,
  `time_window` enum('AM','PM') NOT NULL,
  `max_slots` int(11) DEFAULT 50,
  `booked_slots` int(11) DEFAULT 0,
  `is_locked` tinyint(1) DEFAULT 0,
  PRIMARY KEY (`schedule_id`),
  UNIQUE KEY `unique_schedule` (`schedule_date`,`time_window`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `schedule_capacities`
--

LOCK TABLES `schedule_capacities` WRITE;
/*!40000 ALTER TABLE `schedule_capacities` DISABLE KEYS */;
/*!40000 ALTER TABLE `schedule_capacities` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `social_case_study_reports`
--

DROP TABLE IF EXISTS `social_case_study_reports`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `social_case_study_reports` (
  `report_id` int(11) NOT NULL AUTO_INCREMENT,
  `application_id` int(11) NOT NULL,
  `assigned_social_worker_id` int(11) NOT NULL,
  `time_interview_start` datetime DEFAULT NULL,
  `time_interview_end` datetime DEFAULT NULL,
  `problem_presented` text NOT NULL,
  `brief_findings` text NOT NULL,
  `socio_economic_evaluation` text NOT NULL,
  `evaluation_recommendation` text NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`report_id`),
  UNIQUE KEY `application_id` (`application_id`),
  KEY `assigned_social_worker_id` (`assigned_social_worker_id`),
  CONSTRAINT `social_case_study_reports_ibfk_1` FOREIGN KEY (`application_id`) REFERENCES `applications` (`application_id`) ON DELETE CASCADE,
  CONSTRAINT `social_case_study_reports_ibfk_2` FOREIGN KEY (`assigned_social_worker_id`) REFERENCES `employees` (`employee_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `social_case_study_reports`
--

LOCK TABLES `social_case_study_reports` WRITE;
/*!40000 ALTER TABLE `social_case_study_reports` DISABLE KEYS */;
/*!40000 ALTER TABLE `social_case_study_reports` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `users` (
  `user_id` int(11) NOT NULL AUTO_INCREMENT,
  `username` varchar(50) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `email` varchar(100) NOT NULL,
  `contact_number` varchar(15) NOT NULL,
  `role` enum('CLIENT','EMPLOYEE','ADMIN') NOT NULL DEFAULT 'CLIENT',
  `pasig_pass_id` varchar(50) DEFAULT NULL,
  `failed_login_attempts` int(11) DEFAULT 0,
  `lockout_until` datetime DEFAULT NULL,
  `must_change_password` tinyint(1) DEFAULT 0,
  `is_active` tinyint(1) DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `username` (`username`),
  UNIQUE KEY `email` (`email`),
  UNIQUE KEY `pasig_pass_id` (`pasig_pass_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping events for database 'cswdo_db'
--

--
-- Dumping routines for database 'cswdo_db'
--
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-10-12 20:02:52
