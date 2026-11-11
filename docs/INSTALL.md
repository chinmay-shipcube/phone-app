# Installing on the shop laptop

Everything runs on one Windows laptop at the shop. Staff phones open it over the shop Wi-Fi, and
the laptop prints on the thermal printer connected to it. Allow about an hour on site.

## 1. Postgres

1. Install PostgreSQL (current Windows installer from postgresql.org). Keep the default port 5432 and
   choose a strong password for the `postgres` superuser.
2. Open **SQL Shell (psql)** and create the app's user and database:

   ```sql
   CREATE ROLE celldecor LOGIN PASSWORD 'pick-a-strong-password';
   CREATE DATABASE celldecor OWNER celldecor;
   ```

3. Postgres only needs to listen on the laptop itself. The default `listen_addresses = 'localhost'`
   is correct; do not open port 5432 in the firewall.

## 2. The app

1. Install Node.js LTS (20 or newer).
2. Copy the project folder to the laptop, for example `C:\CellDecor\app`, then in that folder:

   ```powershell
   npm install
   copy .env.example .env      # then edit .env: put the celldecor password in DATABASE_URL
   npm run build
   npm run create-admin        # asks for the owner's admin password (8+ characters)
   npm start                   # first run creates the tables
   ```

3. The console prints the address for the phones, for example `http://192.168.1.20:3000`.

## 3. Thermal printer

1. Install the printer's Windows driver. If there is none, add it with the **Generic / Text Only**
   driver on its `USB00x` port. Do not use WinUSB or Zadig drivers.
2. Check it from the project folder:

   ```powershell
   npm run printer:list    # the thermal printer should be listed, marked [thermal]
   npm run printer:test    # prints a test slip with a cut
   ```

3. In the app, log in as admin, open **Settings > Printer**, pick the printer and paper width, save,
   then tap **Print a test slip**.

The first print compiles a small helper with `csc.exe`, which ships with Windows. It takes a few
seconds once.

## 4. Run it as a Windows service

The server must start by itself after a reboot and keep running with nobody logged in. One simple
way is [NSSM](https://nssm.cc):

```powershell
nssm install CellDecor "C:\Program Files\nodejs\node.exe" "C:\CellDecor\app\dist\server\src\index.js"
nssm set CellDecor AppDirectory "C:\CellDecor\app"
nssm set CellDecor AppStdout "C:\CellDecor\logs\server.log"
nssm set CellDecor AppStderr "C:\CellDecor\logs\server.log"
nssm set CellDecor ObjectName ".\ShopUser" "windows-password-of-ShopUser"
nssm start CellDecor
```

Run the service under the shop's Windows user account (`ObjectName`), not the system account, so it
can see the printer that user installed. Reboot once and print a test slip to confirm.

## 5. Network and laptop settings

- In the router, reserve the laptop's IP address so the phones' address never changes.
- Make sure the staff Wi-Fi does not isolate devices from each other (often called "AP isolation").
- Put customers on a separate guest network: PINs and the admin password cross the Wi-Fi unencrypted.
- Windows Firewall: allow inbound TCP on the app's port (3000) for the **Private** profile only, and
  set the shop Wi-Fi to Private.
- Power settings: never sleep when plugged in, and "Do nothing" when the lid is closed.
- Windows Update: set active hours to cover shop hours so it does not restart mid-day.

## 6. Phones

On each iPhone, open the laptop's address in Safari, tap **Share > Add to Home Screen**. Staff then
open the Cell Decor icon like an app. Over plain HTTP it may open as a normal Safari page; that is
expected for now.

## 7. Backups

Install Google Drive for desktop and pick a synced folder, then in an elevated PowerShell:

```powershell
cd C:\CellDecor\app\scripts\windows
.\register-backup-task.ps1 -BackupDir "G:\My Drive\CellDecor Backups" -At "22:30"
Start-ScheduledTask -TaskName "CellDecor nightly backup"   # run one now
```

Put the `celldecor` password in `%APPDATA%\postgresql\pgpass.conf` for the account that runs the task
(`127.0.0.1:5432:celldecor:celldecor:the-password`). Copy a backup to a USB drive once a week.

**Test a restore once on install day:**

```powershell
createdb -U postgres celldecor_restore_test
pg_restore -U postgres -d celldecor_restore_test "G:\My Drive\CellDecor Backups\celldecor_<date>.dump"
```

Check that bills and invoice numbers are there, then drop the test database.

## 8. Before handing over

- [ ] Admin password set and written down by the owner.
- [ ] Employees added; each knows how to set a PIN.
- [ ] Shop name, address, GSTIN, GST rates and HSN codes confirmed with the owner's CA.
- [ ] Test slip printed after a reboot.
- [ ] One real bill on each phone, then voided by the admin.
- [ ] Backup ran and a restore was tested.
