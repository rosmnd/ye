<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/config/database.php';

require_method('POST');
require_csrf_token();
$input = request_payload();
$errors = [];

$text = static function (string $key) use ($input): string {
    return trim((string)($input[$key] ?? ''));
};
$required = static function (string $key, string $label, int $max) use ($text, &$errors): string {
    $value = $text($key);
    if ($value === '') {
        $errors[$key] = $label . ' is required.';
    } elseif (mb_strlen($value) > $max) {
        $errors[$key] = $label . ' is too long.';
    }
    return $value;
};
$optional = static function (string $key, int $max) use ($text, &$errors): ?string {
    $value = $text($key);
    if ($value === '') {
        return null;
    }
    if (mb_strlen($value) > $max) {
        $errors[$key] = 'This value is too long.';
    }
    return $value;
};
$enumValue = static function (
    string $key,
    string $label,
    array $allowed,
    bool $isRequired,
    string $default = ''
) use ($text, &$errors): string {
    $value = $text($key);
    if ($value === '' && !$isRequired) {
        return $default;
    }
    if (!in_array($value, $allowed, true)) {
        $errors[$key] = 'Choose a valid ' . $label . '.';
        return $default;
    }
    return $value;
};
$money = static function (string $key) use ($text, &$errors): string {
    $value = $text($key);
    if ($value === '') {
        return '0.00';
    }
    if (!preg_match('/^\d{1,8}(?:\.\d{1,2})?$/D', $value)) {
        $errors[$key] = 'Enter a non-negative amount with up to two decimal places.';
        return '0.00';
    }
    return number_format((float)$value, 2, '.', '');
};

$firstName = $required('firstName', 'First name', 50);
$middleName = $optional('middleName', 50);
$lastName = $required('lastName', 'Last name', 50);
$birthDate = $required('birthDate', 'Birth date', 10);
$birthPlace = $required('birthPlace', 'Birth place', 100);
$sex = $enumValue('sex', 'sex', ['Male', 'Female'], true);
$civilStatus = $enumValue(
    'civilStatus',
    'civil status',
    ['Single', 'Married', 'Widowed', 'Separated', 'Others'],
    true
);
$sectoralCategory = $enumValue(
    'sectoralCategory',
    'sectoral category',
    ['4Ps', 'Solo Parent', 'Senior Citizen', 'PWD', 'Other', 'None'],
    false,
    'None'
);
$isPwdRaw = $text('isPwd');
if (!in_array($isPwdRaw, ['0', '1'], true)) {
    $errors['isPwd'] = 'Choose a valid PWD status.';
    $isPwdRaw = '0';
}
$isPwd = (int)$isPwdRaw;
$pwdIdNumber = $isPwd === 1 ? $optional('pwdIdNo', 50) : null;
$education = $optional('educationalAttainment', 100);
$occupation = $optional('occupation', 100);
$monthlyIncome = $money('monthlyIncome');
$unitNumber = $optional('unitNumber', 50);
$houseNumber = $optional('houseNumber', 50);
$street = $required('streetSubdivision', 'Street or subdivision', 150);
$permanentAddress = $required('permanentAddress', 'Permanent address', 250);
$barangay = $required('barangay', 'Barangay', 100);
$housingStatus = $enumValue(
    'housingStatus',
    'housing status',
    ['Owned', 'Renter', 'Sharer/Relative'],
    true
);
$monthlyRent = $housingStatus === 'Renter' ? $money('monthlyRent') : '0.00';
$electricity = $money('monthlyExpensesElectricity');
$water = $money('monthlyExpensesWater');
$food = $money('monthlyExpensesFood');
$otherHelp = $optional('otherSourcesOfHelp', 5000);

$username = $required('username', 'Username', 50);
$email = strtolower($required('email', 'Email address', 100));
$confirmEmail = strtolower($required('confirmEmail', 'Email confirmation', 100));
$contactNumber = $required('contactNumber', 'Contact number', 10);
$password = (string)($input['password'] ?? '');
$confirmPassword = (string)($input['confirmPassword'] ?? '');

if ($username !== '' && !preg_match('/^[A-Za-z0-9._-]{3,50}$/D', $username)) {
    $errors['username'] = 'Use 3–50 letters, numbers, periods, underscores, or hyphens for the username.';
}
if ($email !== '' && (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 100)) {
    $errors['email'] = 'Enter a valid email address.';
}
if ($confirmEmail !== '' && $email !== $confirmEmail) {
    $errors['confirmEmail'] = 'Email addresses do not match.';
}
if ($contactNumber !== '' && !preg_match('/^9\d{9}$/D', $contactNumber)) {
    $errors['contactNumber'] = 'Enter a 10-digit Philippine mobile number starting with 9.';
}

$manilaTimezone = new DateTimeZone('Asia/Manila');
$today = new DateTimeImmutable('today', $manilaTimezone);
$birthDateObject = DateTimeImmutable::createFromFormat('!Y-m-d', $birthDate, $manilaTimezone);
$dateErrors = DateTimeImmutable::getLastErrors();
if (
    !$birthDateObject ||
    ($dateErrors !== false && ($dateErrors['warning_count'] > 0 || $dateErrors['error_count'] > 0)) ||
    $birthDateObject->format('Y-m-d') !== $birthDate ||
    $birthDateObject > $today
) {
    $errors['birthDate'] = 'Enter a valid birth date that is not in the future.';
    $age = 0;
} else {
    $age = $birthDateObject->diff($today)->y;
    if ($age > 150) {
        $errors['birthDate'] = 'Enter a valid birth date.';
    }
}

$passwordStrong =
    strlen($password) >= 8 &&
    preg_match('/[A-Z]/', $password) &&
    preg_match('/[a-z]/', $password) &&
    preg_match('/\d/', $password) &&
    preg_match('/[^A-Za-z0-9\s]/', $password) &&
    strlen($password) >= 8 &&
    strlen($password) <= 72;
if (!$passwordStrong) {
    $errors['password'] = 'Password must be 8–72 bytes and include uppercase, lowercase, number, and a non-space special character.';
}
if ($password !== $confirmPassword) {
    $errors['confirmPassword'] = 'Passwords do not match.';
}

$checked = static function (string $key) use ($input): bool {
    return in_array((string)($input[$key] ?? ''), ['on', '1', 'true'], true);
};
if (!$checked('agreeTerms')) {
    $errors['agreeTerms'] = 'You must agree to the Terms of Service.';
}
if (!$checked('agreePrivacy')) {
    $errors['agreePrivacy'] = 'You must agree to the Privacy Policy.';
}

if ($errors !== []) {
    json_response(422, false, 'Please review the highlighted registration information.', [
        'errors' => $errors,
    ]);
}

try {
    $pdo = database_connection();
    $pdo->beginTransaction();

    $createUser = $pdo->prepare(
        'INSERT INTO users
            (username, password_hash, email, contact_number, role, pasig_pass_id)
         VALUES
            (:username, :password_hash, :email, :contact_number, \'CLIENT\', NULL)'
    );
    $createUser->execute([
        'username' => $username,
        'password_hash' => password_hash($password, PASSWORD_DEFAULT),
        'email' => $email,
        'contact_number' => '+63' . $contactNumber,
    ]);
    $userId = (int)$pdo->lastInsertId();

    $createProfile = $pdo->prepare(
        'INSERT INTO client_profiles (
            user_id, first_name, middle_name, last_name, birth_date, birth_place,
            age, sex, civil_status, sectoral_category, is_pwd, pwd_id_no,
            educational_attainment, occupation, monthly_income, unit_number,
            house_number, street_name_subdivision, permanent_address, barangay,
            housing_status, monthly_rent, monthly_expenses_electricity,
            monthly_expenses_water, monthly_expenses_food, other_sources_of_help
         ) VALUES (
            :user_id, :first_name, :middle_name, :last_name, :birth_date, :birth_place,
            :age, :sex, :civil_status, :sectoral_category, :is_pwd, :pwd_id_no,
            :educational_attainment, :occupation, :monthly_income, :unit_number,
            :house_number, :street_name_subdivision, :permanent_address, :barangay,
            :housing_status, :monthly_rent, :monthly_expenses_electricity,
            :monthly_expenses_water, :monthly_expenses_food, :other_sources_of_help
         )'
    );
    $createProfile->execute([
        'user_id' => $userId,
        'first_name' => $firstName,
        'middle_name' => $middleName,
        'last_name' => $lastName,
        'birth_date' => $birthDate,
        'birth_place' => $birthPlace,
        'age' => $age,
        'sex' => $sex,
        'civil_status' => $civilStatus,
        'sectoral_category' => $sectoralCategory,
        'is_pwd' => $isPwd,
        'pwd_id_no' => $pwdIdNumber,
        'educational_attainment' => $education,
        'occupation' => $occupation,
        'monthly_income' => $monthlyIncome,
        'unit_number' => $unitNumber,
        'house_number' => $houseNumber,
        'street_name_subdivision' => $street,
        'permanent_address' => $permanentAddress,
        'barangay' => $barangay,
        'housing_status' => $housingStatus,
        'monthly_rent' => $monthlyRent,
        'monthly_expenses_electricity' => $electricity,
        'monthly_expenses_water' => $water,
        'monthly_expenses_food' => $food,
        'other_sources_of_help' => $otherHelp,
    ]);

    $pdo->commit();
    json_response(201, true, 'Account created successfully. You can now sign in.', [
        'userId' => $userId,
    ]);
} catch (PDOException $error) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    if ((string)$error->getCode() === '23000') {
        json_response(409, false, 'That username or email address is already in use.');
    }
    error_log('[CSWDO] Registration database error: ' . $error->getMessage());
    json_response(500, false, 'Registration could not be completed. Check the database setup and try again.');
} catch (Throwable $error) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('[CSWDO] Registration failed: ' . $error->getMessage());
    json_response(500, false, 'Registration could not be completed. Check the database setup and try again.');
}
