import PageTitle from '../../components/ui/PageTitle';
import EmptyState from '../../components/ui/EmptyState';

/**
 * Cohorts/staff-assignment scoping is a genuine future schema addition
 * (cohorts + staff_cohort_assignments tables don't exist yet — see
 * INSPIRE_MASTER_CONTEXT.md §6/§17) and was explicitly out of scope for this
 * build: every staff/admin/super_admin sees every participant today, by
 * design, until that migration is planned and approved on its own. This
 * page is an honest placeholder, not a fake filter.
 */
export default function Cohorts() {
  return (
    <div className="space-y-5">
      <PageTitle>Cohorts / Groups</PageTitle>
      <EmptyState
        icon="🗂️"
        title="Cohorts are coming in a future update"
        description="Grouping participants into cohorts (and scoping staff access to their assigned cohort) needs a schema addition that hasn't been planned yet. Every staff/admin/super_admin currently sees every participant."
      />
    </div>
  );
}
