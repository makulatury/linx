// Без консольного окна в собранной программе
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    linx_lib::run()
}
