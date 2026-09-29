import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const updateName = vi.fn();
const changeEmail = vi.fn();
let nameState = { mutate: updateName, isPending: false, isError: false, isSuccess: false };
let emailState = { mutate: changeEmail, isPending: false, isError: false, isSuccess: false };

vi.mock('@/lib/use-account', () => ({
  useUpdateName: () => nameState,
  useChangeEmail: () => emailState,
}));

import { ProfileForm } from './profile-form';

const user = { name: 'Ada Lovelace', email: 'ada@wintel.test' };

afterEach(() => {
  cleanup();
  updateName.mockReset();
  changeEmail.mockReset();
  nameState = { mutate: updateName, isPending: false, isError: false, isSuccess: false };
  emailState = { mutate: changeEmail, isPending: false, isError: false, isSuccess: false };
});

describe('ProfileForm', () => {
  it('saves a changed name and leaves an unchanged one alone', () => {
    render(<ProfileForm user={user} />);

    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ada L' } });
    fireEvent.click(save);

    expect(updateName).toHaveBeenCalledWith('Ada L');
  });

  it('says the confirmation goes to the address on file, not the new one', () => {
    render(<ProfileForm user={user} />);

    expect(screen.getByText(/We email ada@wintel.test to confirm/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'ada@analytical.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));

    expect(changeEmail).toHaveBeenCalledWith('ada@analytical.test');
  });

  it('reports a failed save', () => {
    nameState = { ...nameState, isError: true };

    render(<ProfileForm user={user} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Could not save your name.');
  });
});
