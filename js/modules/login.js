// Login screen.
import * as Auth from '../services/auth.js';
import * as UI from '../core/ui.js';
import { AppError } from '../core/utils.js';

const $ = window.jQuery;

export default {
  async render(container, { setTitle }) {
    setTitle('Sign In');
    const $c = $(container);
    const $form = $c.find('#login-form');
    const $user = $c.find('#login-username');
    const $pass = $c.find('#login-password');
    const $btn = $c.find('#login-btn');
    const $err = $c.find('#login-error');
    const $spin = $c.find('#login-spinner');
    const $hint = $c.find('#login-hint');

    // Show/hide password
    $c.on('click', '.login-pwd-toggle', function () {
      const $inp = $pass;
      const $ico = $(this).find('i');
      if ($inp.attr('type') === 'password') {
        $inp.attr('type', 'text');
        $ico.removeClass('bi-eye').addClass('bi-eye-slash');
      } else {
        $inp.attr('type', 'password');
        $ico.removeClass('bi-eye-slash').addClass('bi-eye');
      }
    });

    // Check if credentials were auto-filled and show hint + pulse button
    const checkAutoFill = () => {
      if ($user.val() && $pass.val()) {
        $hint.removeClass('d-none');
        $btn.addClass('pulse');
      } else {
        $hint.addClass('d-none');
        $btn.removeClass('pulse');
      }
    };

    $user.on('change input', checkAutoFill);
    $pass.on('change input', checkAutoFill);
    checkAutoFill(); // Initial check in case already filled

    // Login submission
    $form.on('submit', async (e) => {
      e.preventDefault();
      const user = $user.val().trim();
      const pass = $pass.val();
      $err.addClass('d-none').empty();

      if (!user || !pass) {
        $err.text('Enter both username and password.').removeClass('d-none');
        return;
      }

      $btn.prop('disabled', true);
      $spin.removeClass('d-none');

      try {
        await Auth.login(user, pass);
        location.hash = '#/dashboard';
      } catch (e) {
        $err.text(e.message || 'Login failed. Try again.').removeClass('d-none');
        $spin.addClass('d-none');
        $btn.prop('disabled', false);
      }
    });
  },
};
