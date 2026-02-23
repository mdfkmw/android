-- phpMyAdmin SQL Dump
-- version 5.2.2
-- https://www.phpmyadmin.net/
--
-- Host: localhost:3306
-- Generation Time: Feb 16, 2026 at 09:11 AM
-- Server version: 10.6.24-MariaDB-cll-lve
-- PHP Version: 8.4.17

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `priscomr_rezervari`
--

-- --------------------------------------------------------

--
-- Table structure for table `agencies`
--

CREATE TABLE `agencies` (
  `id` int(11) NOT NULL,
  `name` text NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `agent_chat_messages`
--

CREATE TABLE `agent_chat_messages` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `author_name` varchar(255) NOT NULL,
  `role` varchar(50) NOT NULL,
  `content` text DEFAULT NULL,
  `attachment_url` text DEFAULT NULL,
  `attachment_type` enum('image','link') DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `agent_jobs`
--

CREATE TABLE `agent_jobs` (
  `id` int(11) NOT NULL,
  `reservation_id` int(11) DEFAULT NULL,
  `payment_id` int(11) DEFAULT NULL,
  `target_terminal_id` int(11) DEFAULT NULL,
  `job_type` varchar(50) NOT NULL,
  `status` enum('queued','in_progress','done','error') NOT NULL DEFAULT 'queued',
  `payload` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`payload`)),
  `result` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`result`)),
  `error_message` text DEFAULT NULL,
  `attempt_count` int(11) NOT NULL DEFAULT 0,
  `last_attempt_at` datetime DEFAULT NULL,
  `agent_hint` varchar(100) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `app_settings`
--

CREATE TABLE `app_settings` (
  `setting_key` varchar(100) NOT NULL,
  `setting_value` text DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `audit_logs`
--

CREATE TABLE `audit_logs` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `actor_id` bigint(20) DEFAULT NULL,
  `entity` varchar(64) NOT NULL,
  `entity_id` bigint(20) DEFAULT NULL,
  `action` varchar(64) NOT NULL,
  `related_entity` varchar(64) DEFAULT 'reservation',
  `related_id` bigint(20) DEFAULT NULL,
  `correlation_id` char(36) DEFAULT NULL,
  `channel` enum('online','agent') DEFAULT NULL,
  `amount` decimal(10,2) DEFAULT NULL,
  `payment_method` enum('cash','card','online') DEFAULT NULL,
  `provider_transaction_id` varchar(128) DEFAULT NULL,
  `note` varchar(255) DEFAULT NULL,
  `before_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`before_json`)),
  `after_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`after_json`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `blacklist`
--

CREATE TABLE `blacklist` (
  `id` int(11) NOT NULL,
  `person_id` int(11) DEFAULT NULL,
  `reason` text DEFAULT NULL,
  `added_by_employee_id` int(11) DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `cash_handovers`
--

CREATE TABLE `cash_handovers` (
  `id` int(11) NOT NULL,
  `employee_id` int(11) DEFAULT NULL,
  `operator_id` int(11) DEFAULT NULL,
  `amount` decimal(10,2) NOT NULL,
  `created_at` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `discount_types`
--

CREATE TABLE `discount_types` (
  `id` int(11) NOT NULL,
  `code` varchar(50) NOT NULL,
  `label` text NOT NULL,
  `value_off` decimal(5,2) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `type` enum('percent','fixed') NOT NULL DEFAULT 'percent',
  `description_required` tinyint(1) NOT NULL DEFAULT 0,
  `description_label` varchar(255) DEFAULT NULL,
  `date_limited` tinyint(1) NOT NULL DEFAULT 0,
  `valid_from` date DEFAULT NULL,
  `valid_to` date DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `employees`
--

CREATE TABLE `employees` (
  `id` int(11) NOT NULL,
  `name` text NOT NULL,
  `username` varchar(191) DEFAULT NULL,
  `phone` varchar(30) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `password_hash` text DEFAULT NULL,
  `role` enum('driver','agent','operator_admin','admin','altceva') NOT NULL,
  `active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `operator_id` int(11) NOT NULL DEFAULT 1,
  `agency_id` int(11) DEFAULT NULL,
  `default_terminal_id` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `idempotency_keys`
--

CREATE TABLE `idempotency_keys` (
  `id` int(11) NOT NULL,
  `user_id` int(11) DEFAULT NULL,
  `idem_key` varchar(128) NOT NULL,
  `reservation_id` int(11) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `incoming_calls`
--

CREATE TABLE `incoming_calls` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `phone` varchar(50) NOT NULL,
  `digits` varchar(30) DEFAULT NULL,
  `extension` varchar(50) DEFAULT NULL,
  `source` varchar(100) DEFAULT NULL,
  `status` varchar(20) DEFAULT NULL,
  `note` text DEFAULT NULL,
  `caller_name` varchar(255) DEFAULT NULL,
  `person_id` bigint(20) DEFAULT NULL,
  `received_at` datetime NOT NULL DEFAULT current_timestamp(),
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `invitations`
--

CREATE TABLE `invitations` (
  `id` int(11) NOT NULL,
  `token` varchar(255) NOT NULL,
  `role` enum('driver','agent','operator_admin','admin') NOT NULL,
  `operator_id` int(11) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `default_terminal_id` int(11) DEFAULT NULL,
  `expires_at` datetime NOT NULL,
  `created_by` int(11) DEFAULT NULL,
  `used_at` datetime DEFAULT NULL,
  `used_by` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `no_shows`
--

CREATE TABLE `no_shows` (
  `id` int(11) NOT NULL,
  `person_id` int(11) DEFAULT NULL,
  `trip_id` int(11) DEFAULT NULL,
  `seat_id` int(11) DEFAULT NULL,
  `reservation_id` int(11) DEFAULT NULL,
  `board_station_id` int(11) DEFAULT NULL,
  `exit_station_id` int(11) DEFAULT NULL,
  `added_by_employee_id` int(11) DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `operators`
--

CREATE TABLE `operators` (
  `id` int(11) NOT NULL,
  `name` text NOT NULL,
  `pos_endpoint` text NOT NULL,
  `theme_color` varchar(7) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `orders`
--

CREATE TABLE `orders` (
  `id` int(11) NOT NULL,
  `trip_id` int(11) NOT NULL,
  `operator_id` int(11) NOT NULL,
  `public_user_id` bigint(20) UNSIGNED DEFAULT NULL,
  `customer_email` varchar(255) NOT NULL,
  `customer_phone` varchar(32) NOT NULL,
  `customer_name` varchar(255) DEFAULT NULL,
  `board_station_id` int(11) NOT NULL,
  `exit_station_id` int(11) NOT NULL,
  `promo_code_id` int(11) DEFAULT NULL,
  `promo_value_off` decimal(10,2) DEFAULT NULL,
  `total_amount` decimal(10,2) NOT NULL,
  `status` enum('pending','paid','failed','expired','cancelled') NOT NULL DEFAULT 'pending',
  `email_sent_at` datetime DEFAULT NULL,
  `payment_provider` varchar(20) NOT NULL DEFAULT 'ipay',
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `expires_at` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `order_items`
--

CREATE TABLE `order_items` (
  `id` int(11) NOT NULL,
  `order_id` int(11) NOT NULL,
  `seat_id` int(11) NOT NULL,
  `traveler_name` varchar(255) NOT NULL,
  `traveler_phone` varchar(32) DEFAULT NULL,
  `discount_type_id` int(11) DEFAULT NULL,
  `discount_amount` decimal(10,2) DEFAULT NULL,
  `discount_snapshot` decimal(10,2) DEFAULT NULL,
  `promo_code_id` int(11) DEFAULT NULL,
  `promo_discount_amount` decimal(10,2) DEFAULT NULL,
  `price_amount` decimal(10,2) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `payments`
--

CREATE TABLE `payments` (
  `id` int(11) NOT NULL,
  `reservation_id` int(11) DEFAULT NULL,
  `order_id` int(11) DEFAULT NULL,
  `operator_id` int(11) DEFAULT NULL,
  `amount` decimal(10,2) NOT NULL,
  `status` enum('pending','pos_ok_waiting_receipt','paid','failed','voided','refunded') NOT NULL DEFAULT 'pending',
  `payment_method` varchar(20) DEFAULT NULL,
  `provider` varchar(20) DEFAULT NULL,
  `provider_transaction_id` text DEFAULT NULL,
  `provider_payment_id` varchar(64) DEFAULT NULL,
  `provider_order_number` varchar(64) DEFAULT NULL,
  `timestamp` datetime DEFAULT current_timestamp(),
  `deposited_at` date DEFAULT NULL,
  `deposited_by` int(11) DEFAULT NULL,
  `collected_by` int(11) DEFAULT NULL,
  `cash_handover_id` int(11) DEFAULT NULL,
  `receipt_status` enum('none','ok','error_needs_retry') NOT NULL DEFAULT 'none'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `payments_public_orders`
--

CREATE TABLE `payments_public_orders` (
  `id` int(11) NOT NULL,
  `order_id` int(11) NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `status` enum('pending','pos_ok_waiting_receipt','paid','failed','voided','refunded') NOT NULL DEFAULT 'pending',
  `payment_method` varchar(20) DEFAULT NULL,
  `provider` varchar(20) DEFAULT NULL,
  `provider_transaction_id` text DEFAULT NULL,
  `provider_payment_id` varchar(64) DEFAULT NULL,
  `provider_order_number` varchar(64) DEFAULT NULL,
  `timestamp` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `payment_refunds`
--

CREATE TABLE `payment_refunds` (
  `id` int(11) NOT NULL,
  `payment_id` int(11) DEFAULT NULL,
  `public_order_payment_id` int(11) DEFAULT NULL,
  `order_id` int(11) DEFAULT NULL,
  `amount` decimal(10,2) NOT NULL,
  `currency` char(3) NOT NULL DEFAULT 'RON',
  `status` enum('pending','succeeded','failed','voided') NOT NULL DEFAULT 'pending',
  `provider` varchar(20) DEFAULT NULL,
  `provider_refund_id` varchar(128) DEFAULT NULL,
  `provider_transaction_id` text DEFAULT NULL,
  `provider_payload` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`provider_payload`)),
  `reason` varchar(255) DEFAULT NULL,
  `requested_by` int(11) DEFAULT NULL,
  `requested_by_type` enum('public_user','employee','system') DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `processed_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `people`
--

CREATE TABLE `people` (
  `id` int(11) NOT NULL,
  `name` varchar(255) DEFAULT NULL,
  `phone` varchar(30) DEFAULT NULL,
  `owner_status` enum('active','pending','hidden') NOT NULL DEFAULT 'active',
  `prev_owner_id` int(11) DEFAULT NULL,
  `replaced_by_id` int(11) DEFAULT NULL,
  `owner_changed_by` int(11) DEFAULT NULL,
  `owner_changed_at` datetime DEFAULT NULL,
  `blacklist` tinyint(1) NOT NULL DEFAULT 0,
  `whitelist` tinyint(1) NOT NULL DEFAULT 0,
  `notes` text DEFAULT NULL,
  `notes_by` int(11) DEFAULT NULL,
  `notes_at` datetime DEFAULT NULL,
  `is_active` tinyint(1) GENERATED ALWAYS AS (case when `owner_status` = 'active' then 1 else NULL end) STORED,
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `price_lists`
--

CREATE TABLE `price_lists` (
  `id` int(11) NOT NULL,
  `name` text NOT NULL,
  `version` int(11) NOT NULL DEFAULT 1,
  `effective_from` date NOT NULL,
  `created_by` int(11) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `route_id` int(11) NOT NULL,
  `category_id` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `price_list_items`
--

CREATE TABLE `price_list_items` (
  `id` int(11) NOT NULL,
  `price` decimal(10,2) NOT NULL,
  `currency` varchar(5) NOT NULL DEFAULT 'RON',
  `price_return` decimal(10,2) DEFAULT NULL,
  `price_list_id` int(11) DEFAULT NULL,
  `from_station_id` int(11) NOT NULL,
  `to_station_id` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `pricing_categories`
--

CREATE TABLE `pricing_categories` (
  `id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `description` text DEFAULT NULL,
  `active` tinyint(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `promo_codes`
--

CREATE TABLE `promo_codes` (
  `id` int(11) NOT NULL,
  `code` varchar(50) NOT NULL,
  `label` text NOT NULL,
  `type` enum('percent','fixed') NOT NULL,
  `value_off` decimal(7,2) NOT NULL,
  `valid_from` datetime DEFAULT NULL,
  `valid_to` datetime DEFAULT NULL,
  `active` tinyint(1) NOT NULL DEFAULT 1,
  `channels` set('online','agent') NOT NULL DEFAULT 'online',
  `min_price` decimal(10,2) DEFAULT NULL,
  `max_discount` decimal(10,2) DEFAULT NULL,
  `max_total_uses` int(11) DEFAULT NULL,
  `max_uses_per_person` int(11) DEFAULT NULL,
  `combinable` tinyint(1) NOT NULL DEFAULT 0,
  `created_by` int(11) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `promo_code_hours`
--

CREATE TABLE `promo_code_hours` (
  `promo_code_id` int(11) NOT NULL,
  `start_time` time NOT NULL,
  `end_time` time NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `promo_code_routes`
--

CREATE TABLE `promo_code_routes` (
  `promo_code_id` int(11) NOT NULL,
  `route_id` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `promo_code_schedules`
--

CREATE TABLE `promo_code_schedules` (
  `promo_code_id` int(11) NOT NULL,
  `route_schedule_id` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `promo_code_usages`
--

CREATE TABLE `promo_code_usages` (
  `id` int(11) NOT NULL,
  `promo_code_id` int(11) NOT NULL,
  `reservation_id` int(11) DEFAULT NULL,
  `phone` varchar(30) DEFAULT NULL,
  `used_at` datetime NOT NULL DEFAULT current_timestamp(),
  `discount_amount` decimal(10,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `promo_code_weekdays`
--

CREATE TABLE `promo_code_weekdays` (
  `promo_code_id` int(11) NOT NULL,
  `weekday` tinyint(1) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `public_users`
--

CREATE TABLE `public_users` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `email` varchar(255) NOT NULL,
  `email_normalized` varchar(255) NOT NULL,
  `password_hash` varchar(255) DEFAULT NULL,
  `name` varchar(255) DEFAULT NULL,
  `phone` varchar(32) DEFAULT NULL,
  `phone_normalized` varchar(32) DEFAULT NULL,
  `email_verified_at` datetime DEFAULT NULL,
  `phone_verified_at` datetime DEFAULT NULL,
  `google_sub` varchar(191) DEFAULT NULL,
  `apple_sub` varchar(191) DEFAULT NULL,
  `last_login_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `public_user_email_verifications`
--

CREATE TABLE `public_user_email_verifications` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `user_id` bigint(20) UNSIGNED NOT NULL,
  `token_hash` char(64) NOT NULL,
  `expires_at` datetime NOT NULL,
  `consumed_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `public_user_oauth_identities`
--

CREATE TABLE `public_user_oauth_identities` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `user_id` bigint(20) UNSIGNED NOT NULL,
  `provider` varchar(32) NOT NULL,
  `provider_user_id` varchar(191) NOT NULL,
  `email` varchar(255) DEFAULT NULL,
  `name` varchar(255) DEFAULT NULL,
  `raw_profile` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`raw_profile`)),
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `public_user_password_resets`
--

CREATE TABLE `public_user_password_resets` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `user_id` bigint(20) UNSIGNED NOT NULL,
  `token_hash` char(64) NOT NULL,
  `expires_at` datetime NOT NULL,
  `used_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `public_user_phone_links`
--

CREATE TABLE `public_user_phone_links` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `user_id` bigint(20) UNSIGNED NOT NULL,
  `person_id` int(11) DEFAULT NULL,
  `phone` varchar(32) NOT NULL,
  `normalized_phone` varchar(32) NOT NULL,
  `status` enum('pending','verified','expired','failed','cancelled') NOT NULL DEFAULT 'pending',
  `channel` enum('sms','whatsapp') NOT NULL DEFAULT 'sms',
  `verification_code_hash` char(64) NOT NULL,
  `request_token` char(36) NOT NULL,
  `attempt_count` int(11) NOT NULL DEFAULT 0,
  `expires_at` datetime NOT NULL,
  `verified_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `public_user_sessions`
--

CREATE TABLE `public_user_sessions` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `user_id` bigint(20) UNSIGNED NOT NULL,
  `token_hash` char(64) NOT NULL,
  `user_agent` varchar(255) DEFAULT NULL,
  `ip_address` varchar(64) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `expires_at` datetime NOT NULL,
  `revoked_at` datetime DEFAULT NULL,
  `rotated_from` char(64) DEFAULT NULL,
  `persistent` tinyint(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `reservations`
--

CREATE TABLE `reservations` (
  `id` int(11) NOT NULL,
  `trip_id` int(11) DEFAULT NULL,
  `seat_id` int(11) DEFAULT NULL,
  `person_id` int(11) DEFAULT NULL,
  `reservation_time` timestamp NULL DEFAULT current_timestamp(),
  `status` enum('active','cancelled') NOT NULL DEFAULT 'active',
  `observations` text DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `order_id` int(11) DEFAULT NULL,
  `board_station_id` int(11) NOT NULL,
  `exit_station_id` int(11) NOT NULL,
  `boarded` tinyint(1) NOT NULL DEFAULT 0,
  `boarded_at` datetime DEFAULT NULL,
  `version` int(11) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `reservations_backup`
--

CREATE TABLE `reservations_backup` (
  `id` int(11) NOT NULL,
  `reservation_id` int(11) DEFAULT NULL,
  `trip_id` int(11) DEFAULT NULL,
  `seat_id` int(11) DEFAULT NULL,
  `label` text DEFAULT NULL,
  `person_id` int(11) DEFAULT NULL,
  `backup_time` datetime DEFAULT current_timestamp(),
  `old_vehicle_id` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `reservation_discounts`
--

CREATE TABLE `reservation_discounts` (
  `id` int(11) NOT NULL,
  `reservation_id` int(11) NOT NULL,
  `discount_type_id` int(11) DEFAULT NULL,
  `promo_code_id` int(11) DEFAULT NULL,
  `discount_amount` decimal(10,2) NOT NULL,
  `applied_at` datetime NOT NULL DEFAULT current_timestamp(),
  `discount_snapshot` decimal(5,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `reservation_events`
--

CREATE TABLE `reservation_events` (
  `id` int(11) NOT NULL,
  `reservation_id` int(11) NOT NULL,
  `action` enum('create','update','move','cancel','uncancel','delete','pay','refund') NOT NULL,
  `actor_id` int(11) DEFAULT NULL,
  `details` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`details`)),
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `reservation_intents`
--

CREATE TABLE `reservation_intents` (
  `id` int(11) NOT NULL,
  `trip_id` int(11) NOT NULL,
  `seat_id` int(11) NOT NULL,
  `user_id` int(11) DEFAULT NULL,
  `order_id` int(11) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `expires_at` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `reservation_pricing`
--

CREATE TABLE `reservation_pricing` (
  `reservation_id` int(11) NOT NULL,
  `price_value` decimal(10,2) NOT NULL,
  `price_list_id` int(11) NOT NULL,
  `pricing_category_id` int(11) NOT NULL,
  `booking_channel` enum('online','agent','driver') NOT NULL DEFAULT 'agent',
  `employee_id` int(11) NOT NULL DEFAULT 12,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `routes`
--

CREATE TABLE `routes` (
  `id` int(11) NOT NULL,
  `name` text NOT NULL,
  `order_index` int(11) DEFAULT NULL,
  `visible_in_reservations` tinyint(1) DEFAULT 1,
  `visible_for_drivers` tinyint(1) DEFAULT 1,
  `visible_online` tinyint(4) DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `route_schedules`
--

CREATE TABLE `route_schedules` (
  `id` int(11) NOT NULL,
  `route_id` int(11) NOT NULL,
  `departure` time NOT NULL,
  `operator_id` int(11) NOT NULL,
  `direction` enum('tur','retur') NOT NULL DEFAULT 'tur'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `route_schedule_default_vehicles`
--

CREATE TABLE `route_schedule_default_vehicles` (
  `route_schedule_id` int(11) NOT NULL,
  `vehicle_id` int(11) NOT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `route_schedule_discounts`
--

CREATE TABLE `route_schedule_discounts` (
  `discount_type_id` int(11) NOT NULL,
  `route_schedule_id` int(11) NOT NULL,
  `visible_agents` tinyint(1) NOT NULL DEFAULT 1,
  `visible_online` tinyint(1) NOT NULL DEFAULT 0,
  `visible_driver` tinyint(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `route_schedule_pricing_categories`
--

CREATE TABLE `route_schedule_pricing_categories` (
  `route_schedule_id` int(11) NOT NULL,
  `pricing_category_id` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `route_schedule_seat_blocks`
--

CREATE TABLE `route_schedule_seat_blocks` (
  `id` int(11) NOT NULL,
  `route_schedule_id` int(11) NOT NULL,
  `vehicle_id` int(11) NOT NULL,
  `seat_id` int(11) NOT NULL,
  `block_online` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `route_stations`
--

CREATE TABLE `route_stations` (
  `id` int(11) NOT NULL,
  `route_id` int(11) NOT NULL,
  `station_id` int(11) NOT NULL,
  `sequence` int(11) NOT NULL,
  `distance_from_previous_km` decimal(6,2) DEFAULT NULL,
  `travel_time_from_previous_minutes` int(11) DEFAULT NULL,
  `dwell_time_minutes` int(11) DEFAULT 0,
  `geofence_type` enum('circle','polygon') NOT NULL DEFAULT 'circle',
  `geofence_radius_m` decimal(10,2) DEFAULT NULL,
  `geofence_polygon` geometry DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp(),
  `public_note_tur` varchar(255) DEFAULT NULL,
  `public_note_retur` varchar(255) DEFAULT NULL,
  `public_latitude_tur` decimal(10,7) DEFAULT NULL,
  `public_longitude_tur` decimal(10,7) DEFAULT NULL,
  `public_latitude_retur` decimal(10,7) DEFAULT NULL,
  `public_longitude_retur` decimal(10,7) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `schedule_exceptions`
--

CREATE TABLE `schedule_exceptions` (
  `id` int(11) NOT NULL,
  `schedule_id` int(11) NOT NULL,
  `exception_date` date DEFAULT NULL,
  `weekday` tinyint(3) UNSIGNED DEFAULT NULL,
  `disable_run` tinyint(1) NOT NULL DEFAULT 0,
  `disable_online` tinyint(1) NOT NULL DEFAULT 0,
  `created_by_employee_id` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `seats`
--

CREATE TABLE `seats` (
  `id` int(11) NOT NULL,
  `vehicle_id` int(11) DEFAULT NULL,
  `seat_number` int(11) DEFAULT NULL,
  `position` varchar(20) DEFAULT NULL,
  `row` int(11) NOT NULL,
  `seat_col` int(11) NOT NULL,
  `is_available` tinyint(1) NOT NULL DEFAULT 1,
  `label` text DEFAULT NULL,
  `seat_type` enum('normal','driver','guide','foldable','wheelchair') NOT NULL DEFAULT 'normal',
  `pair_id` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `seat_locks`
--

CREATE TABLE `seat_locks` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `trip_id` bigint(20) UNSIGNED NOT NULL,
  `seat_id` bigint(20) UNSIGNED NOT NULL,
  `board_station_id` bigint(20) UNSIGNED NOT NULL,
  `exit_station_id` bigint(20) UNSIGNED NOT NULL,
  `operator_id` bigint(20) UNSIGNED DEFAULT NULL,
  `employee_id` bigint(20) UNSIGNED DEFAULT NULL,
  `hold_token` varchar(64) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `expires_at` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `sessions`
--

CREATE TABLE `sessions` (
  `id` int(11) NOT NULL,
  `employee_id` int(11) NOT NULL,
  `token_hash` varchar(255) NOT NULL,
  `user_agent` varchar(255) DEFAULT NULL,
  `ip` varchar(64) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `expires_at` datetime NOT NULL,
  `revoked_at` datetime DEFAULT NULL,
  `rotated_from` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `stations`
--

CREATE TABLE `stations` (
  `id` int(11) NOT NULL,
  `name` text NOT NULL,
  `locality` text DEFAULT NULL,
  `county` text DEFAULT NULL,
  `latitude` decimal(11,8) DEFAULT NULL,
  `longitude` decimal(11,8) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `terminals`
--

CREATE TABLE `terminals` (
  `id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `terminal_key` varchar(255) NOT NULL,
  `active` tinyint(1) DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `traveler_defaults`
--

CREATE TABLE `traveler_defaults` (
  `id` int(11) NOT NULL,
  `phone` varchar(30) DEFAULT NULL,
  `route_id` int(11) DEFAULT NULL,
  `use_count` int(11) DEFAULT 0,
  `last_used_at` datetime DEFAULT NULL,
  `board_station_id` int(11) DEFAULT NULL,
  `exit_station_id` int(11) DEFAULT NULL,
  `direction` enum('tur','retur') NOT NULL DEFAULT 'tur'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `trips`
--

CREATE TABLE `trips` (
  `id` int(11) NOT NULL,
  `route_id` int(11) DEFAULT NULL,
  `date` date DEFAULT NULL,
  `time` time DEFAULT NULL,
  `disabled` tinyint(1) NOT NULL DEFAULT 0,
  `route_schedule_id` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Triggers `trips`
--
DELIMITER $$
CREATE TRIGGER `trg_trips_ai_snapshot` AFTER INSERT ON `trips` FOR EACH ROW BEGIN
  CALL sp_fill_trip_stations(NEW.id);
END
$$
DELIMITER ;

-- --------------------------------------------------------

--
-- Table structure for table `trip_stations`
--

CREATE TABLE `trip_stations` (
  `trip_id` int(11) NOT NULL,
  `station_id` int(11) NOT NULL,
  `sequence` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `trip_vehicles`
--

CREATE TABLE `trip_vehicles` (
  `id` int(11) NOT NULL,
  `trip_id` int(11) DEFAULT NULL,
  `vehicle_id` int(11) DEFAULT NULL,
  `is_primary` tinyint(1) NOT NULL DEFAULT 0,
  `boarding_started` tinyint(1) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `trip_vehicle_employees`
--

CREATE TABLE `trip_vehicle_employees` (
  `id` int(11) NOT NULL,
  `trip_vehicle_id` int(11) DEFAULT NULL,
  `employee_id` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `user_preferences`
--

CREATE TABLE `user_preferences` (
  `user_id` bigint(20) NOT NULL,
  `prefs_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT json_object() CHECK (json_valid(`prefs_json`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `user_route_order`
--

CREATE TABLE `user_route_order` (
  `id` bigint(20) NOT NULL,
  `user_id` bigint(20) NOT NULL,
  `route_id` bigint(20) NOT NULL,
  `position_idx` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `vehicles`
--

CREATE TABLE `vehicles` (
  `id` int(11) NOT NULL,
  `name` text NOT NULL,
  `seat_count` int(11) DEFAULT NULL,
  `type` varchar(20) DEFAULT NULL,
  `plate_number` varchar(20) DEFAULT NULL,
  `vin` varchar(32) DEFAULT NULL,
  `operator_id` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Indexes for dumped tables
--

--
-- Indexes for table `agencies`
--
ALTER TABLE `agencies`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `agent_chat_messages`
--
ALTER TABLE `agent_chat_messages`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `agent_jobs`
--
ALTER TABLE `agent_jobs`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_agent_jobs_status` (`status`),
  ADD KEY `idx_agent_jobs_reservation` (`reservation_id`),
  ADD KEY `idx_agent_jobs_payment` (`payment_id`);

--
-- Indexes for table `app_settings`
--
ALTER TABLE `app_settings`
  ADD UNIQUE KEY `uniq_setting_key` (`setting_key`);

--
-- Indexes for table `audit_logs`
--
ALTER TABLE `audit_logs`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_audit_created_at` (`created_at`),
  ADD KEY `idx_audit_action` (`action`),
  ADD KEY `idx_audit_entity_id` (`entity`,`entity_id`),
  ADD KEY `idx_audit_related_id` (`related_entity`,`related_id`);

--
-- Indexes for table `discount_types`
--
ALTER TABLE `discount_types`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `employees`
--
ALTER TABLE `employees`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_employees_role` (`role`);

--
-- Indexes for table `idempotency_keys`
--
ALTER TABLE `idempotency_keys`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_user_key` (`user_id`,`idem_key`);

--
-- Indexes for table `incoming_calls`
--
ALTER TABLE `incoming_calls`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_received_at` (`received_at`),
  ADD KEY `idx_digits` (`digits`);

--
-- Indexes for table `invitations`
--
ALTER TABLE `invitations`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `token` (`token`),
  ADD KEY `fk_inv_operator` (`operator_id`);

--
-- Indexes for table `no_shows`
--
ALTER TABLE `no_shows`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `operators`
--
ALTER TABLE `operators`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `orders`
--
ALTER TABLE `orders`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_orders_trip` (`trip_id`),
  ADD KEY `idx_orders_status` (`status`),
  ADD KEY `idx_orders_expires` (`expires_at`),
  ADD KEY `idx_orders_public_user` (`public_user_id`),
  ADD KEY `idx_orders_promo_code` (`promo_code_id`);

--
-- Indexes for table `order_items`
--
ALTER TABLE `order_items`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_order_items_order_seat` (`order_id`,`seat_id`),
  ADD KEY `idx_order_items_order` (`order_id`),
  ADD KEY `idx_order_items_seat` (`seat_id`),
  ADD KEY `idx_order_items_discount_type` (`discount_type_id`),
  ADD KEY `idx_order_items_promo_code` (`promo_code_id`);

--
-- Indexes for table `payments`
--
ALTER TABLE `payments`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_payments_order` (`order_id`),
  ADD KEY `idx_payments_ipay_order_id` (`provider_payment_id`);

--
-- Indexes for table `payments_public_orders`
--
ALTER TABLE `payments_public_orders`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_payments_public_orders_order` (`order_id`),
  ADD KEY `idx_payments_public_orders_provider_payment_id` (`provider_payment_id`);

--
-- Indexes for table `payment_refunds`
--
ALTER TABLE `payment_refunds`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_payment_refunds_payment_id` (`payment_id`),
  ADD KEY `idx_payment_refunds_public_payment_id` (`public_order_payment_id`),
  ADD KEY `idx_payment_refunds_order_id` (`order_id`),
  ADD KEY `idx_payment_refunds_status_created` (`status`,`created_at`),
  ADD KEY `idx_payment_refunds_provider_ref` (`provider`,`provider_refund_id`);

--
-- Indexes for table `people`
--
ALTER TABLE `people`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `ux_people_phone_active` (`phone`,`is_active`),
  ADD KEY `ix_people_owner_changed_by` (`owner_changed_by`),
  ADD KEY `ix_people_owner_changed_at` (`owner_changed_at`);

--
-- Indexes for table `price_lists`
--
ALTER TABLE `price_lists`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `price_list_items`
--
ALTER TABLE `price_list_items`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_price_list_items_unique` (`price_list_id`,`from_station_id`,`to_station_id`);

--
-- Indexes for table `pricing_categories`
--
ALTER TABLE `pricing_categories`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `promo_codes`
--
ALTER TABLE `promo_codes`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `code` (`code`);

--
-- Indexes for table `promo_code_hours`
--
ALTER TABLE `promo_code_hours`
  ADD PRIMARY KEY (`promo_code_id`,`start_time`,`end_time`);

--
-- Indexes for table `promo_code_routes`
--
ALTER TABLE `promo_code_routes`
  ADD PRIMARY KEY (`promo_code_id`,`route_id`),
  ADD KEY `route_id` (`route_id`);

--
-- Indexes for table `promo_code_schedules`
--
ALTER TABLE `promo_code_schedules`
  ADD PRIMARY KEY (`promo_code_id`,`route_schedule_id`),
  ADD KEY `route_schedule_id` (`route_schedule_id`);

--
-- Indexes for table `promo_code_usages`
--
ALTER TABLE `promo_code_usages`
  ADD PRIMARY KEY (`id`),
  ADD KEY `promo_code_id` (`promo_code_id`);

--
-- Indexes for table `promo_code_weekdays`
--
ALTER TABLE `promo_code_weekdays`
  ADD PRIMARY KEY (`promo_code_id`,`weekday`);

--
-- Indexes for table `public_users`
--
ALTER TABLE `public_users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_public_users_email_norm` (`email_normalized`),
  ADD UNIQUE KEY `uniq_public_users_google` (`google_sub`),
  ADD UNIQUE KEY `uniq_public_users_apple` (`apple_sub`),
  ADD KEY `idx_public_users_phone_norm` (`phone_normalized`);

--
-- Indexes for table `public_user_email_verifications`
--
ALTER TABLE `public_user_email_verifications`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `idx_public_user_email_verifications_token` (`token_hash`),
  ADD KEY `idx_public_user_email_verifications_user` (`user_id`);

--
-- Indexes for table `public_user_oauth_identities`
--
ALTER TABLE `public_user_oauth_identities`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_public_user_oauth_identity` (`provider`,`provider_user_id`),
  ADD KEY `idx_public_user_oauth_email` (`email`),
  ADD KEY `fk_public_user_oauth_user` (`user_id`);

--
-- Indexes for table `public_user_password_resets`
--
ALTER TABLE `public_user_password_resets`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `idx_public_user_password_resets_token` (`token_hash`),
  ADD KEY `idx_public_user_password_resets_user` (`user_id`);

--
-- Indexes for table `public_user_phone_links`
--
ALTER TABLE `public_user_phone_links`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_public_phone_request` (`request_token`),
  ADD KEY `idx_public_phone_user` (`user_id`),
  ADD KEY `idx_public_phone_person` (`person_id`),
  ADD KEY `idx_public_phone_status` (`status`),
  ADD KEY `idx_public_phone_normalized` (`normalized_phone`);

--
-- Indexes for table `public_user_sessions`
--
ALTER TABLE `public_user_sessions`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_public_sessions_hash` (`token_hash`),
  ADD KEY `idx_public_sessions_user` (`user_id`),
  ADD KEY `idx_public_sessions_expires` (`expires_at`);

--
-- Indexes for table `reservations`
--
ALTER TABLE `reservations`
  ADD PRIMARY KEY (`id`),
  ADD KEY `ix_res_trip_seat_status` (`trip_id`,`seat_id`,`status`),
  ADD KEY `ix_res_person_time` (`person_id`,`reservation_time`),
  ADD KEY `idx_reservations_order` (`order_id`);

--
-- Indexes for table `reservations_backup`
--
ALTER TABLE `reservations_backup`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `reservation_discounts`
--
ALTER TABLE `reservation_discounts`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_resdisc_promo` (`promo_code_id`);

--
-- Indexes for table `reservation_events`
--
ALTER TABLE `reservation_events`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_reservation` (`reservation_id`);

--
-- Indexes for table `reservation_intents`
--
ALTER TABLE `reservation_intents`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_intents_trip` (`trip_id`),
  ADD KEY `idx_intents_seat` (`seat_id`),
  ADD KEY `idx_intents_expires` (`expires_at`),
  ADD KEY `idx_intents_order` (`order_id`);

--
-- Indexes for table `reservation_pricing`
--
ALTER TABLE `reservation_pricing`
  ADD PRIMARY KEY (`reservation_id`);

--
-- Indexes for table `routes`
--
ALTER TABLE `routes`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `route_schedules`
--
ALTER TABLE `route_schedules`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_route_time_dir_op` (`route_id`,`departure`,`direction`,`operator_id`);

--
-- Indexes for table `route_schedule_default_vehicles`
--
ALTER TABLE `route_schedule_default_vehicles`
  ADD PRIMARY KEY (`route_schedule_id`),
  ADD KEY `idx_rsdv_vehicle` (`vehicle_id`);

--
-- Indexes for table `route_schedule_discounts`
--
ALTER TABLE `route_schedule_discounts`
  ADD PRIMARY KEY (`discount_type_id`,`route_schedule_id`);

--
-- Indexes for table `route_schedule_pricing_categories`
--
ALTER TABLE `route_schedule_pricing_categories`
  ADD PRIMARY KEY (`route_schedule_id`,`pricing_category_id`),
  ADD KEY `route_schedule_pricing_categories_category_id_idx` (`pricing_category_id`);

--
-- Indexes for table `route_schedule_seat_blocks`
--
ALTER TABLE `route_schedule_seat_blocks`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_rssb_schedule_seat` (`route_schedule_id`,`seat_id`),
  ADD KEY `idx_rssb_vehicle` (`vehicle_id`),
  ADD KEY `fk_rssb_seat` (`seat_id`);

--
-- Indexes for table `route_stations`
--
ALTER TABLE `route_stations`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_route_station` (`route_id`,`station_id`),
  ADD KEY `idx_route_seq` (`route_id`,`sequence`),
  ADD KEY `ix_rs_route_station` (`route_id`,`station_id`),
  ADD KEY `ix_rs_route_sequence` (`route_id`,`sequence`);

--
-- Indexes for table `schedule_exceptions`
--
ALTER TABLE `schedule_exceptions`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_schedule` (`schedule_id`),
  ADD KEY `idx_exception_date` (`exception_date`),
  ADD KEY `idx_weekday` (`weekday`),
  ADD KEY `idx_sched_date_week` (`schedule_id`,`exception_date`,`weekday`);

--
-- Indexes for table `seats`
--
ALTER TABLE `seats`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_vehicle_grid` (`vehicle_id`,`row`,`seat_col`),
  ADD UNIQUE KEY `uq_vehicle_label` (`vehicle_id`,`label`) USING HASH,
  ADD KEY `idx_pair` (`vehicle_id`,`pair_id`);

--
-- Indexes for table `seat_locks`
--
ALTER TABLE `seat_locks`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_hold_token` (`hold_token`),
  ADD KEY `idx_seatlocks_trip` (`trip_id`),
  ADD KEY `idx_seatlocks_seat` (`seat_id`);

--
-- Indexes for table `sessions`
--
ALTER TABLE `sessions`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `token_hash` (`token_hash`),
  ADD KEY `idx_sessions_emp` (`employee_id`),
  ADD KEY `idx_sessions_exp` (`expires_at`);

--
-- Indexes for table `stations`
--
ALTER TABLE `stations`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `terminals`
--
ALTER TABLE `terminals`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `terminal_key` (`terminal_key`);

--
-- Indexes for table `traveler_defaults`
--
ALTER TABLE `traveler_defaults`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_phone_route_dir` (`phone`,`route_id`,`direction`),
  ADD KEY `idx_phone_stations` (`phone`,`board_station_id`,`exit_station_id`),
  ADD KEY `ix_td_read` (`phone`,`route_id`,`direction`,`use_count`,`last_used_at`,`board_station_id`,`exit_station_id`);

--
-- Indexes for table `trips`
--
ALTER TABLE `trips`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_trips_schedule_date_time` (`route_schedule_id`,`date`,`time`);

--
-- Indexes for table `trip_stations`
--
ALTER TABLE `trip_stations`
  ADD PRIMARY KEY (`trip_id`,`station_id`),
  ADD UNIQUE KEY `uq_trip_seq` (`trip_id`,`sequence`),
  ADD KEY `fk_ts_station` (`station_id`);

--
-- Indexes for table `trip_vehicles`
--
ALTER TABLE `trip_vehicles`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_tv_trip_vehicle` (`trip_id`,`vehicle_id`),
  ADD KEY `idx_tv_trip` (`trip_id`),
  ADD KEY `idx_tv_vehicle` (`vehicle_id`);

--
-- Indexes for table `trip_vehicle_employees`
--
ALTER TABLE `trip_vehicle_employees`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_tve_trip_employee` (`trip_vehicle_id`,`employee_id`),
  ADD KEY `idx_tve_trip_vehicle_id` (`trip_vehicle_id`),
  ADD KEY `idx_tve_employee_id` (`employee_id`);

--
-- Indexes for table `user_preferences`
--
ALTER TABLE `user_preferences`
  ADD PRIMARY KEY (`user_id`);

--
-- Indexes for table `user_route_order`
--
ALTER TABLE `user_route_order`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_user_route` (`user_id`,`route_id`),
  ADD KEY `idx_user_pos` (`user_id`,`position_idx`);

--
-- Indexes for table `vehicles`
--
ALTER TABLE `vehicles`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_vehicles_vin` (`vin`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `agencies`
--
ALTER TABLE `agencies`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `agent_chat_messages`
--
ALTER TABLE `agent_chat_messages`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `agent_jobs`
--
ALTER TABLE `agent_jobs`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `audit_logs`
--
ALTER TABLE `audit_logs`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `discount_types`
--
ALTER TABLE `discount_types`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `employees`
--
ALTER TABLE `employees`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `idempotency_keys`
--
ALTER TABLE `idempotency_keys`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `incoming_calls`
--
ALTER TABLE `incoming_calls`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `invitations`
--
ALTER TABLE `invitations`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `no_shows`
--
ALTER TABLE `no_shows`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `operators`
--
ALTER TABLE `operators`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `orders`
--
ALTER TABLE `orders`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `order_items`
--
ALTER TABLE `order_items`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `payments`
--
ALTER TABLE `payments`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `payments_public_orders`
--
ALTER TABLE `payments_public_orders`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `payment_refunds`
--
ALTER TABLE `payment_refunds`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `people`
--
ALTER TABLE `people`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `price_lists`
--
ALTER TABLE `price_lists`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `price_list_items`
--
ALTER TABLE `price_list_items`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `pricing_categories`
--
ALTER TABLE `pricing_categories`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `promo_codes`
--
ALTER TABLE `promo_codes`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `promo_code_usages`
--
ALTER TABLE `promo_code_usages`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `public_users`
--
ALTER TABLE `public_users`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `public_user_email_verifications`
--
ALTER TABLE `public_user_email_verifications`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `public_user_oauth_identities`
--
ALTER TABLE `public_user_oauth_identities`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `public_user_password_resets`
--
ALTER TABLE `public_user_password_resets`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `public_user_phone_links`
--
ALTER TABLE `public_user_phone_links`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `public_user_sessions`
--
ALTER TABLE `public_user_sessions`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `reservations`
--
ALTER TABLE `reservations`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `reservations_backup`
--
ALTER TABLE `reservations_backup`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `reservation_discounts`
--
ALTER TABLE `reservation_discounts`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `reservation_events`
--
ALTER TABLE `reservation_events`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `reservation_intents`
--
ALTER TABLE `reservation_intents`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `routes`
--
ALTER TABLE `routes`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `route_schedules`
--
ALTER TABLE `route_schedules`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `route_schedule_seat_blocks`
--
ALTER TABLE `route_schedule_seat_blocks`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `route_stations`
--
ALTER TABLE `route_stations`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `schedule_exceptions`
--
ALTER TABLE `schedule_exceptions`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `seats`
--
ALTER TABLE `seats`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `sessions`
--
ALTER TABLE `sessions`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `stations`
--
ALTER TABLE `stations`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `terminals`
--
ALTER TABLE `terminals`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `traveler_defaults`
--
ALTER TABLE `traveler_defaults`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `trips`
--
ALTER TABLE `trips`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `trip_vehicles`
--
ALTER TABLE `trip_vehicles`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `trip_vehicle_employees`
--
ALTER TABLE `trip_vehicle_employees`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `user_route_order`
--
ALTER TABLE `user_route_order`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `vehicles`
--
ALTER TABLE `vehicles`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `invitations`
--
ALTER TABLE `invitations`
  ADD CONSTRAINT `fk_inv_operator` FOREIGN KEY (`operator_id`) REFERENCES `operators` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

--
-- Constraints for table `orders`
--
ALTER TABLE `orders`
  ADD CONSTRAINT `fk_orders_public_user` FOREIGN KEY (`public_user_id`) REFERENCES `public_users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

--
-- Constraints for table `order_items`
--
ALTER TABLE `order_items`
  ADD CONSTRAINT `fk_order_items_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Constraints for table `payments`
--
ALTER TABLE `payments`
  ADD CONSTRAINT `fk_payments_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

--
-- Constraints for table `payments_public_orders`
--
ALTER TABLE `payments_public_orders`
  ADD CONSTRAINT `fk_payments_public_orders_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Constraints for table `payment_refunds`
--
ALTER TABLE `payment_refunds`
  ADD CONSTRAINT `fk_payment_refunds_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_payment_refunds_payment` FOREIGN KEY (`payment_id`) REFERENCES `payments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_payment_refunds_public_payment` FOREIGN KEY (`public_order_payment_id`) REFERENCES `payments_public_orders` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

--
-- Constraints for table `promo_code_routes`
--
ALTER TABLE `promo_code_routes`
  ADD CONSTRAINT `fk_promo_routes_code` FOREIGN KEY (`promo_code_id`) REFERENCES `promo_codes` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `promo_code_schedules`
--
ALTER TABLE `promo_code_schedules`
  ADD CONSTRAINT `fk_promo_sched_code` FOREIGN KEY (`promo_code_id`) REFERENCES `promo_codes` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `promo_code_usages`
--
ALTER TABLE `promo_code_usages`
  ADD CONSTRAINT `fk_promo_usages_code` FOREIGN KEY (`promo_code_id`) REFERENCES `promo_codes` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `promo_code_weekdays`
--
ALTER TABLE `promo_code_weekdays`
  ADD CONSTRAINT `fk_promo_weekdays_code` FOREIGN KEY (`promo_code_id`) REFERENCES `promo_codes` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `public_user_email_verifications`
--
ALTER TABLE `public_user_email_verifications`
  ADD CONSTRAINT `fk_public_user_email_verifications_user` FOREIGN KEY (`user_id`) REFERENCES `public_users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `public_user_oauth_identities`
--
ALTER TABLE `public_user_oauth_identities`
  ADD CONSTRAINT `fk_public_user_oauth_user` FOREIGN KEY (`user_id`) REFERENCES `public_users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `public_user_password_resets`
--
ALTER TABLE `public_user_password_resets`
  ADD CONSTRAINT `fk_public_user_password_resets_user` FOREIGN KEY (`user_id`) REFERENCES `public_users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `public_user_phone_links`
--
ALTER TABLE `public_user_phone_links`
  ADD CONSTRAINT `fk_public_phone_person` FOREIGN KEY (`person_id`) REFERENCES `people` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_public_phone_user` FOREIGN KEY (`user_id`) REFERENCES `public_users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Constraints for table `public_user_sessions`
--
ALTER TABLE `public_user_sessions`
  ADD CONSTRAINT `fk_public_sessions_user` FOREIGN KEY (`user_id`) REFERENCES `public_users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Constraints for table `reservations`
--
ALTER TABLE `reservations`
  ADD CONSTRAINT `fk_reservations_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

--
-- Constraints for table `reservation_discounts`
--
ALTER TABLE `reservation_discounts`
  ADD CONSTRAINT `fk_resdisc_promo` FOREIGN KEY (`promo_code_id`) REFERENCES `promo_codes` (`id`);

--
-- Constraints for table `reservation_events`
--
ALTER TABLE `reservation_events`
  ADD CONSTRAINT `fk_reservation_events_res` FOREIGN KEY (`reservation_id`) REFERENCES `reservations` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `reservation_intents`
--
ALTER TABLE `reservation_intents`
  ADD CONSTRAINT `fk_intents_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

--
-- Constraints for table `route_schedule_default_vehicles`
--
ALTER TABLE `route_schedule_default_vehicles`
  ADD CONSTRAINT `fk_rsdv_schedule` FOREIGN KEY (`route_schedule_id`) REFERENCES `route_schedules` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_rsdv_vehicle` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles` (`id`) ON UPDATE CASCADE;

--
-- Constraints for table `route_schedule_pricing_categories`
--
ALTER TABLE `route_schedule_pricing_categories`
  ADD CONSTRAINT `fk_rspc_category` FOREIGN KEY (`pricing_category_id`) REFERENCES `pricing_categories` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_rspc_schedule` FOREIGN KEY (`route_schedule_id`) REFERENCES `route_schedules` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Constraints for table `route_schedule_seat_blocks`
--
ALTER TABLE `route_schedule_seat_blocks`
  ADD CONSTRAINT `fk_rssb_schedule` FOREIGN KEY (`route_schedule_id`) REFERENCES `route_schedules` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_rssb_seat` FOREIGN KEY (`seat_id`) REFERENCES `seats` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_rssb_vehicle` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Constraints for table `schedule_exceptions`
--
ALTER TABLE `schedule_exceptions`
  ADD CONSTRAINT `fk_se_schedule` FOREIGN KEY (`schedule_id`) REFERENCES `route_schedules` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Constraints for table `sessions`
--
ALTER TABLE `sessions`
  ADD CONSTRAINT `fk_sess_emp` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Constraints for table `trip_stations`
--
ALTER TABLE `trip_stations`
  ADD CONSTRAINT `fk_ts_station` FOREIGN KEY (`station_id`) REFERENCES `stations` (`id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_ts_trip` FOREIGN KEY (`trip_id`) REFERENCES `trips` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
